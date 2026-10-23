(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const ui={svg:$('packing'),search:$('search'),results:$('search-results'),regions:$('region-select'),reset:$('reset'),up:$('up'),view:$('view-label'),status:$('status'),panel:$('detail-panel'),title:$('detail-title'),type:$('detail-type'),route:$('breadcrumb'),population:$('population'),exact:$('population-exact'),share:$('share-total'),secondaryTitle:$('metric-secondary-title'),secondary:$('metric-secondary'),children:$('children'),childrenTitle:$('children-title'),childrenCount:$('children-count'),legend:$('region-legend')};
  const colors={
    'East Asia & Pacific':'#347eae',
    'Europe & Central Asia':'#8c6baa',
    'Latin America & Caribbean':'#258778',
    'Middle East & North Africa':'#b28328',
    'North America':'#bd6474',
    'South Asia':'#ce753d',
    'Sub-Saharan Africa':'#708c3e'
  };
  const regionNames={
    'East Asia & Pacific':'Asia oriental y el Pacífico',
    'Europe & Central Asia':'Europa y Asia central',
    'Latin America & Caribbean':'América Latina y el Caribe',
    'Middle East & North Africa':'Oriente Medio y norte de África',
    'North America':'América del Norte',
    'South Asia':'Asia meridional',
    'Sub-Saharan Africa':'África subsahariana'
  };
  const ns='http://www.w3.org/2000/svg';
  const integer=new Intl.NumberFormat('es-ES');
  const decimal=new Intl.NumberFormat('es-ES',{maximumFractionDigits:2});
  let root,selected,focus,metadata,leaves=[],nodes=[],ring,animation=0;
  let camera={x:500,y:500,size:1060};
  let overview={...camera};
  const leafElements=new Map(),labels=new Map(),regionLabels=new Map();

  function svgElement(tag,attributes={}){const element=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attributes))element.setAttribute(key,value);return element;}
  function button(text,className,action){const element=document.createElement('button');element.type='button';element.className=className;element.textContent=text;element.addEventListener('click',action);return element;}
  function compact(value){if(value>=1e9)return `${decimal.format(value/1e9)} mil millones`;if(value>=1e6)return `${decimal.format(value/1e6)} millones`;if(value>=1e3)return `${decimal.format(value/1e3)} mil`;return integer.format(value);}
  function percent(value,total){const amount=value/total*100;return new Intl.NumberFormat('es-ES',{maximumFractionDigits:amount<.01?6:2}).format(amount)+' %';}
  function regionOf(node){return node.depth===1?node:node.parent;}
  function colorOf(node){return colors[regionOf(node)?.data.name] || '#8aa3ae';}
  function displayName(node){return node.depth===1?(regionNames[node.data.name] || node.data.name):node.data.name;}
  function normalize(text){return text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();}

  function renderPanel(){
    const restoreFocus=ui.children.contains(document.activeElement)||ui.route.contains(document.activeElement);
    ui.title.textContent=displayName(selected);
    ui.type.textContent=selected===root?'Conjunto representado':selected.children?'Región del Banco Mundial':`Economía · ${selected.data.id}`;
    ui.population.textContent=compact(selected.value);
    ui.exact.textContent=`${integer.format(selected.value)} personas`;
    ui.share.textContent=percent(selected.value,root.value);
    ui.secondaryTitle.textContent=selected.children?'Economías':'Economías en su región';
    ui.secondary.textContent=integer.format(selected.children?selected.leaves().length:selected.parent.children.length);
    ui.route.replaceChildren();
    selected.ancestors().reverse().forEach((node,index)=>{
      if(index){const separator=document.createElement('span');separator.textContent='›';separator.setAttribute('aria-hidden','true');ui.route.append(separator);}
      const name=node===root?'Conjunto':displayName(node);
      if(node===selected){const current=document.createElement('span');current.className='current';current.textContent=name;ui.route.append(current);}
      else ui.route.append(button(name,'route-button',()=>selectNode(node)));
    });
    const children=focus.children || [];
    ui.childrenTitle.textContent=focus===root?'Regiones':`Economías de ${displayName(focus)}`;
    ui.childrenCount.textContent=String(children.length);
    ui.children.replaceChildren();
    children.forEach(node=>{
      const item=button('','child-button',()=>selectNode(node));
      item.dataset.id=node.data.id;
      if(node===selected)item.setAttribute('aria-current','true');
      const swatch=document.createElement('span');swatch.className='swatch';swatch.style.setProperty('--region-color',colorOf(node));swatch.setAttribute('aria-hidden','true');
      const name=document.createElement('span');name.textContent=displayName(node);
      const value=document.createElement('span');value.className='number';value.textContent=compact(node.value);
      item.append(swatch,name,value);ui.children.append(item);
    });
    if(restoreFocus){const target=[...ui.children.querySelectorAll('button')].find(item=>item.dataset.id===selected.data.id);(target || ui.title).focus({preventScroll:true});}
  }

  function updateLabels(){
    if(!root)return;
    const pixelWidth=Math.max(1,ui.svg.getBoundingClientRect().width);
    const unit=camera.size/pixelWidth;
    const font=12*unit;
    const plot=ui.svg.getBoundingClientRect(),occupied=[];
    const accept=label=>{
      const rect=label.getBoundingClientRect();
      const box={left:rect.left-3,right:rect.right+3,top:rect.top-3,bottom:rect.bottom+3};
      const inside=box.left>=plot.left && box.right<=plot.right && box.top>=plot.top && box.bottom<=plot.bottom;
      const overlap=occupied.some(other=>box.left<other.right && box.right>other.left && box.top<other.bottom && box.bottom>other.top);
      if(inside && !overlap){occupied.push(box);return true;}
      label.setAttribute('display','none');return false;
    };
    for(const node of root.children){
      const label=regionLabels.get(node.data.id);
      label.setAttribute('display',focus===root?'':'none');
      label.setAttribute('font-size',13*unit);
      label.setAttribute('stroke-width',4*unit);
      label.setAttribute('transform',`translate(${node.x},${node.y-node.r*.68})`);
      [...label.children].forEach((line,index)=>{line.setAttribute('x',0);line.setAttribute('dy',index?15*unit:0);});
      if(focus===root){
        const rect=label.getBoundingClientRect();
        if(rect.width>node.r/unit*1.4 || rect.height>node.r/unit*.65)label.setAttribute('display','none');
        else accept(label);
      }
    }
    for(const node of leaves.slice().sort((a,b)=>(b===selected)-(a===selected) || b.value-a.value)){
      const label=labels.get(node.data.id);
      label.setAttribute('display','none');
      if((focus!==root && node.parent!==focus) || node.r/unit<20)continue;
      label.setAttribute('display','');label.setAttribute('font-size',font);label.setAttribute('stroke-width',3*unit);
      label.textContent=node.data.name;
      if(label.getComputedTextLength()>node.r*1.55)label.textContent=node.data.id;
      if(label.getComputedTextLength()>node.r*1.55)label.setAttribute('display','none');
      else accept(label);
    }
    if(selected && selected!==root){
      ring.setAttribute('display','');ring.setAttribute('cx',selected.x);ring.setAttribute('cy',selected.y);
      ring.setAttribute('r',Math.max(selected.r+4*unit,6*unit));
    }else ring.setAttribute('display','none');
  }

  function drawCamera(){ui.svg.setAttribute('viewBox',`${camera.x-camera.size/2} ${camera.y-camera.size/2} ${camera.size} ${camera.size}`);updateLabels();}
  function zoomTo(node){
    cancelAnimationFrame(animation);
    const target=node===root?{...overview}:{x:node.x,y:node.y,size:node.r*2.2};
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){camera=target;drawCamera();return;}
    const initial={...camera},start=performance.now();
    function frame(now){
      const fraction=Math.min(1,(now-start)/480),ease=1-Math.pow(1-fraction,3);
      camera={x:initial.x+(target.x-initial.x)*ease,y:initial.y+(target.y-initial.y)*ease,size:initial.size+(target.size-initial.size)*ease};
      drawCamera();if(fraction<1)animation=requestAnimationFrame(frame);
    }
    animation=requestAnimationFrame(frame);
  }

  function selectNode(node){
    if(!root || !node)return;
    selected=node;focus=node.children?node:node.parent;
    ui.regions.value=focus.data.id;
    ui.up.disabled=focus===root;
    ui.view.textContent=focus===root?'Vista general · misma escala':`${displayName(focus)} · escala ampliada`;
    for(const [id,circle] of leafElements)circle.setAttribute('fill-opacity',id===node.data.id?'1':'.82');
    renderPanel();zoomTo(focus);
    ui.status.textContent=`${displayName(node)}: ${integer.format(node.value)} personas. ${focus===root?'Vista general.':'Vista de '+displayName(focus)+'.'}`;
  }

  function wrapName(name,maxLength=21){
    const lines=[];let line='';
    for(const word of name.split(' ')){if(line && (line+' '+word).length>maxLength){lines.push(line);line=word;}else line=line?line+' '+word:word;}
    if(line)lines.push(line);return lines;
  }

  function drawHierarchy(){
    const containers=svgElement('g',{'class':'region-containers'}),circles=svgElement('g',{'class':'economy-circles'}),text=svgElement('g',{'class':'labels','aria-hidden':'true'});
    ui.svg.replaceChildren(containers,circles,text);
    root.children.forEach(node=>{
      const circle=svgElement('circle',{'class':'region-circle',cx:node.x,cy:node.y,r:node.r,fill:colorOf(node),stroke:colorOf(node),'data-id':node.data.id});
      const title=svgElement('title');title.textContent=`${displayName(node)}: ${integer.format(node.value)} personas`;circle.append(title);circle.addEventListener('click',()=>selectNode(node));containers.append(circle);
    });
    leaves.forEach(node=>{
      const circle=svgElement('circle',{'class':'economy-circle',cx:node.x,cy:node.y,r:node.r,fill:colorOf(node),'fill-opacity':'.82','data-id':node.data.id});
      const title=svgElement('title');title.textContent=`${node.data.name} (${node.data.id}): ${integer.format(node.value)} personas · ${displayName(node.parent)}`;circle.append(title);
      circle.addEventListener('click',()=>selectNode(node));circles.append(circle);leafElements.set(node.data.id,circle);
      const label=svgElement('text',{'class':'packing-label',x:node.x,y:node.y,'data-id':node.data.id});text.append(label);labels.set(node.data.id,label);
    });
    root.children.forEach(node=>{
      const label=svgElement('text',{'class':'region-label','data-id':node.data.id});
      wrapName(displayName(node)).forEach(line=>{const part=svgElement('tspan');part.textContent=line;label.append(part);});
      text.append(label);regionLabels.set(node.data.id,label);
    });
    ring=svgElement('circle',{'class':'selection-ring','aria-hidden':'true',display:'none'});ui.svg.append(ring);
  }

  function searchMatches(query){
    const q=normalize(query);if(!q)return [];
    return leaves.map((node,index)=>{const name=normalize(node.data.name),code=normalize(node.data.id);return {node,index,rank:name===q||code===q?0:name.startsWith(q)||code.startsWith(q)?1:name.includes(q)?2:3};})
      .filter(item=>item.rank<3).sort((a,b)=>a.rank-b.rank||a.index-b.index).slice(0,12).map(item=>item.node);
  }
  function hideSearch(){ui.results.hidden=true;ui.search.setAttribute('aria-expanded','false');}
  function chooseSearch(node){ui.search.value=node.data.name;hideSearch();ui.search.focus({preventScroll:true});selectNode(node);}
  function showSearch(){
    ui.results.replaceChildren();const query=ui.search.value.trim();if(!query){hideSearch();return;}
    const matches=searchMatches(query);
    if(!matches.length){const empty=document.createElement('p');empty.className='empty-search';empty.textContent='No se encontró esa economía. Prueba el nombre del Banco Mundial o su código de tres letras.';ui.results.append(empty);}
    matches.forEach(node=>{const item=button(`${node.data.name} · ${node.data.id}`,'search-result',()=>chooseSearch(node));const region=document.createElement('small');region.textContent=displayName(node.parent);item.append(region);ui.results.append(item);});
    ui.results.hidden=false;ui.search.setAttribute('aria-expanded','true');
  }

  async function start(){
    if(!window.d3?.pack)throw Error('No se ha cargado la biblioteca de círculos. Recarga la página desde el servidor local.');
    const response=await fetch('../../Datos/processed/population_2025.json');
    if(!response.ok)throw Error('No se pudo leer el conjunto de población. Ejecuta prepare_data.py y abre esta página desde el servidor local.');
    const data=await response.json();metadata=data.metadata;
    root=d3.hierarchy(data.tree).sum(node=>node.population || 0).sort((a,b)=>b.value-a.value || a.data.id.localeCompare(b.data.id));
    leaves=root.leaves();nodes=root.descendants();
    if(leaves.length!==217 || root.children.length!==7 || root.value!==metadata.represented_population || new Set(leaves.map(n=>n.data.id)).size!==217 || leaves.some(n=>!Number.isSafeInteger(n.value)||n.value<=0))throw Error('Los datos no coinciden con la estructura validada de 217 economías y siete regiones.');
    d3.pack().size([1000,1000]).padding(node=>node.depth===0?16:3)(root);
    const minX=Math.min(...root.children.map(n=>n.x-n.r)),maxX=Math.max(...root.children.map(n=>n.x+n.r));
    const minY=Math.min(...root.children.map(n=>n.y-n.r)),maxY=Math.max(...root.children.map(n=>n.y+n.r));
    overview={x:(minX+maxX)/2,y:(minY+maxY)/2,size:Math.max(maxX-minX,maxY-minY)+32};
    camera={...overview};
    drawHierarchy();
    root.children.forEach(node=>{
      const option=document.createElement('option');option.value=node.data.id;option.textContent=displayName(node);ui.regions.append(option);
      const item=button('','legend-item',()=>{ui.search.value='';hideSearch();selectNode(node);});
      const swatch=document.createElement('span');swatch.className='swatch';swatch.style.setProperty('--region-color',colorOf(node));swatch.setAttribute('aria-hidden','true');item.append(swatch,document.createTextNode(displayName(node)));ui.legend.append(item);
    });
    $('represented-total').textContent=integer.format(root.value);
    $('coverage-detail').textContent=`${integer.format(metadata.world_aggregate)} personas en la fila mundial, ${integer.format(metadata.difference_from_world)} más que el total representado.`;
    $('updated').textContent=metadata.last_updated.split('-').reverse().join('/');
    const leaders=leaves.slice().sort((a,b)=>b.value-a.value);
    $('insight').textContent=`${leaders[0].data.name} y ${leaders[1].data.name} reúnen el ${percent(leaders[0].value+leaders[1].value,root.value)} de la población representada. ${leaders[2].data.name} ocupa la tercera posición. Entra en una región para comparar sus economías y consulta las cifras en el panel.`;
    for(const control of [ui.search,ui.regions,ui.reset])control.disabled=false;
    selectNode(root);drawCamera();
    new ResizeObserver(updateLabels).observe(ui.svg);
    window.populationPacking={root,nodes,leaves,metadata,selectNode,displayName,get overview(){return {...overview};},get selected(){return selected;},get focus(){return focus;},get camera(){return camera;}};
  }

  ui.search.addEventListener('input',showSearch);
  ui.search.addEventListener('keydown',event=>{
    if(event.key==='Escape'){hideSearch();ui.search.value='';}
    if(event.key==='Enter'){const match=searchMatches(ui.search.value)[0];if(match){event.preventDefault();chooseSearch(match);}}
    if(event.key==='ArrowDown' && !ui.results.hidden){const item=ui.results.querySelector('button');if(item){event.preventDefault();item.focus();}}
  });
  ui.results.addEventListener('keydown',event=>{
    const items=[...ui.results.querySelectorAll('button')],index=items.indexOf(document.activeElement);
    if(event.key==='ArrowDown'){event.preventDefault();items[Math.min(index+1,items.length-1)]?.focus();}
    if(event.key==='ArrowUp'){event.preventDefault();if(index<=0)ui.search.focus();else items[index-1].focus();}
    if(event.key==='Escape'){hideSearch();ui.search.focus();}
  });
  document.addEventListener('click',event=>{if(event.target!==ui.search && !ui.results.contains(event.target))hideSearch();});
  ui.regions.addEventListener('change',()=>{const node=nodes.find(n=>n.data.id===ui.regions.value);ui.search.value='';hideSearch();selectNode(node);});
  ui.reset.addEventListener('click',()=>{ui.search.value='';hideSearch();selectNode(root);});
  ui.up.addEventListener('click',()=>{ui.search.value='';hideSearch();selectNode(focus?.parent || root);});
  start().catch(error=>{console.error(error);ui.status.textContent=error.message;});
})();
