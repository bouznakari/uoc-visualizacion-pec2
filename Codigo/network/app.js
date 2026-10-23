(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const ui={svg:$('network'),search:$('search'),results:$('search-results'),neighborhood:$('neighborhood'),reset:$('reset'),zoomIn:$('zoom-in'),zoomOut:$('zoom-out'),fit:$('fit'),center:$('center'),count:$('view-count'),status:$('status'),title:$('detail-title'),type:$('detail-type'),description:$('detail-description'),degree:$('degree'),clear:$('clear'),list:$('node-list'),listTitle:$('list-title'),listCount:$('list-count')};
  let nodes=[],links=[],byId,adjacency,baseline,world,nodeGroups,edgeLines,labelElements,labelBackdrops,ring,zoom;
  let selected=null,subset=false,visibleIds=new Set(),transform;
  const sorted=list=>list.slice().sort((a,b)=>b.degree-a.degree || a.id.localeCompare(b.id,'es'));
  const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const normalize=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();
  function button(text,className,action){const b=document.createElement('button');b.type='button';b.className=className;b.textContent=text;b.addEventListener('click',action);return b;}
  function screenUnit(){return 1000/Math.max(1,ui.svg.getBoundingClientRect().width)/transform.k;}

  function renderPanel(){
    const restoreFocus=ui.list.contains(document.activeElement);
    const node=selected?byId.get(selected):null;
    ui.title.textContent=node?node.id:'Elige un personaje';
    ui.type.textContent=node?'Personaje seleccionado':'Explorar la red';
    ui.description.textContent=node?'Sus vecinos se resaltan en el gráfico. Las cifras del panel y de la lista corresponden siempre a la red completa.':'Busca un nombre o elígelo de la lista para resaltar sus conexiones.';
    ui.degree.textContent=node?String(node.degree):'—';
    ui.clear.disabled=!node;ui.center.disabled=!node;ui.neighborhood.disabled=!node;
    const items=node?sorted([...adjacency.get(node.id)].map(id=>byId.get(id))):sorted(nodes);
    ui.listTitle.textContent=node?'Vecinos de '+node.id:'Personajes por grado';ui.listCount.textContent=String(items.length);ui.list.replaceChildren();
    items.forEach(item=>{
      const entry=button(item.id,'list-node',()=>{selectNode(item.id);centerSelection();});entry.dataset.id=item.id;
      const degree=document.createElement('small');degree.textContent=`${item.degree} vecinos`;entry.append(degree);ui.list.append(entry);
    });
    if(restoreFocus)ui.title.focus({preventScroll:true});
  }

  function updateLabels(){
    if(!labelElements)return;
    const unit=screenUnit(),plot=ui.svg.getBoundingClientRect(),occupied=[];
    const circles=nodeGroups.filter(node=>visibleIds.has(node.id)).select('.node-disc').nodes().map(e=>{
      const id=e.parentElement.__data__.id,r=e.getBoundingClientRect(),pad=id===selected?5:0;
      return {id,rect:{left:r.left-pad,right:r.right+pad,top:r.top-pad,bottom:r.bottom+pad}};
    });
    labelElements.attr('display','none').attr('font-size',12*unit).attr('stroke-width',3*unit);
    labelBackdrops.attr('display','none');
    const candidates=sorted(nodes.filter(node=>visibleIds.has(node.id) && (!selected || node.id===selected || adjacency.get(selected).has(node.id))));
    candidates.sort((a,b)=>(b.id===selected)-(a.id===selected) || b.degree-a.degree || a.id.localeCompare(b.id));
    const names=selected || transform.k>1.4?candidates:candidates.slice(0,12);
    const budget=plot.width<500?5:plot.width<700?8:10;
    for(const node of names){
      if(occupied.length>=budget)break;
      const label=labelElements.filter(item=>item.id===node.id);
      const positions=[{x:node.x+node.r+10*unit,y:node.y,anchor:'start'},{x:node.x,y:node.y-node.r-16*unit,anchor:'middle'},{x:node.x-node.r-10*unit,y:node.y,anchor:'end'},{x:node.x,y:node.y+node.r+16*unit,anchor:'middle'}];
      for(const position of positions){
        label.attr('display',null).attr('x',position.x).attr('y',position.y).attr('text-anchor',position.anchor);
        const r=label.node().getBoundingClientRect();
        const box={left:r.left-5,right:r.right+5,top:r.top-5,bottom:r.bottom+5};
        const intersects=other=>box.left<other.right && box.right>other.left && box.top<other.bottom && box.bottom>other.top;
        const inside=box.left>=plot.left+3 && box.right<=plot.right-3 && box.top>=plot.top+3 && box.bottom<=plot.bottom-3;
        if(inside && !occupied.some(intersects) && !circles.some(item=>item.id!==node.id && intersects(item.rect))){
          occupied.push(box);
          const bounds=label.node().getBBox();
          labelBackdrops.filter(item=>item.id===node.id).attr('display',null).attr('x',bounds.x-3*unit).attr('y',bounds.y-2*unit).attr('width',bounds.width+6*unit).attr('height',bounds.height+4*unit).attr('rx',2*unit);
          break;
        }
        label.attr('display','none');
      }
    }
    nodeGroups.select('.node-hit').attr('r',node=>Math.max(node.r,10*unit));
    if(selected){const node=byId.get(selected);ring.attr('display',null).attr('cx',node.x).attr('cy',node.y).attr('r',Math.max(node.r+4*unit,6*unit));}
    else ring.attr('display','none');
  }

  function updatePositions(){
    nodeGroups.attr('transform',node=>`translate(${node.x},${node.y})`);
    edgeLines.attr('x1',edge=>byId.get(edge.source).x).attr('y1',edge=>byId.get(edge.source).y).attr('x2',edge=>byId.get(edge.target).x).attr('y2',edge=>byId.get(edge.target).y);
    updateLabels();
  }

  function renderState(){
    visibleIds=subset && selected?new Set([selected,...adjacency.get(selected)]):new Set(nodes.map(node=>node.id));
    const visibleLinks=links.filter(edge=>visibleIds.has(edge.source) && visibleIds.has(edge.target));
    const neighbors=selected?adjacency.get(selected):new Set();
    nodeGroups.attr('display',node=>visibleIds.has(node.id)?null:'none').attr('opacity',node=>!selected || node.id===selected || neighbors.has(node.id)?1:.3);
    nodeGroups.select('.node-disc').style('fill',node=>node.id===selected?'#b76237':neighbors.has(node.id)?'#28796e':'#478b8d')
      .style('stroke',node=>node.id===selected?'#753b20':neighbors.has(node.id)?'#215e53':'white').style('stroke-width',node=>node.id===selected?2:1.1);
    edgeLines.attr('display',edge=>visibleIds.has(edge.source)&&visibleIds.has(edge.target)?null:'none')
      .style('stroke',edge=>edge.source===selected || edge.target===selected?'#256e63':'#9aadb1')
      .style('stroke-width',edge=>edge.source===selected || edge.target===selected?2:1.1)
      .style('stroke-opacity',edge=>!selected ? .5 : edge.source===selected || edge.target===selected ? .9 : subset ? .45 : .12);
    ui.neighborhood.textContent=subset?'Ver red completa':'Ver vecindario';ui.neighborhood.setAttribute('aria-pressed',String(subset));
    ui.count.textContent=subset?`Vecindario: ${visibleIds.size} de 77 personajes · ${visibleLinks.length} de 254 relaciones`:'Red completa · 77 personajes · 254 relaciones';
    ui.status.textContent=selected?`${selected}: ${byId.get(selected).degree} vecinos distintos en la red completa.`:'Red lista. Selecciona un personaje para explorar sus conexiones.';
    renderPanel();updateLabels();
  }

  function selectNode(id){if(!byId?.has(id))return;selected=id;renderState();}
  function applyTransform(next){const selection=d3.select(ui.svg).interrupt();if(reduced())selection.call(zoom.transform,next);else selection.transition().duration(240).call(zoom.transform,next);}
  function centerSelection(){if(!selected)return;const node=byId.get(selected),minimum=ui.svg.getBoundingClientRect().width<500?2.2:1.6,k=Math.max(minimum,transform.k);applyTransform(d3.zoomIdentity.translate(500-k*node.x,400-k*node.y).scale(k));}
  function zoomBy(factor){const x=(500-transform.x)/transform.k,y=(400-transform.y)/transform.k,k=Math.min(4,Math.max(.55,transform.k*factor));applyTransform(d3.zoomIdentity.translate(500-k*x,400-k*y).scale(k));}
  function fitVisible(){
    const visible=nodes.filter(node=>visibleIds.has(node.id));if(!visible.length)return;
    const x0=Math.min(...visible.map(n=>n.x-n.r)),x1=Math.max(...visible.map(n=>n.x+n.r)),y0=Math.min(...visible.map(n=>n.y-n.r)),y1=Math.max(...visible.map(n=>n.y+n.r));
    const k=Math.min(2.6,Math.max(.55,Math.min(900/Math.max(1,x1-x0),680/Math.max(1,y1-y0))));
    applyTransform(d3.zoomIdentity.translate(500-k*(x0+x1)/2,400-k*(y0+y1)/2).scale(k));
  }

  function draw(){
    const svg=d3.select(ui.svg);svg.selectAll('*').remove();world=svg.append('g').attr('class','world');
    edgeLines=world.append('g').attr('class','edges').selectAll('line').data(links).join('line').attr('class','network-edge').attr('data-source',edge=>edge.source).attr('data-target',edge=>edge.target);
    nodeGroups=world.append('g').attr('class','nodes').selectAll('g').data(nodes).join('g').attr('class','network-node').attr('data-id',node=>node.id);
    nodeGroups.append('circle').attr('class','node-disc').attr('r',node=>node.r);
    nodeGroups.append('circle').attr('class','node-hit');
    nodeGroups.append('title').text(node=>`${node.id}: ${node.degree} vecinos distintos`);
    nodeGroups.on('click',(event,node)=>{event.stopPropagation();selectNode(node.id);});
    nodeGroups.call(d3.drag().container(()=>world.node()).on('start',(event,node)=>{event.sourceEvent.stopPropagation();selectNode(node.id);}).on('drag',(event,node)=>{node.x=event.x;node.y=event.y;updatePositions();}));
    const labelLayer=world.append('g').attr('aria-hidden','true');
    labelBackdrops=labelLayer.selectAll('rect').data(nodes).join('rect').attr('class','label-backdrop').attr('data-id',node=>node.id).attr('display','none');
    labelElements=labelLayer.selectAll('text').data(nodes).join('text').attr('class','node-label').attr('data-id',node=>node.id).text(node=>node.id);
    ring=world.append('circle').attr('class','node-ring').attr('aria-hidden','true').attr('display','none');
    zoom=d3.zoom().extent([[0,0],[1000,800]]).scaleExtent([.55,4]).on('zoom',event=>{
      transform=event.transform;world.attr('transform',transform);ui.zoomIn.disabled=transform.k>=3.999;ui.zoomOut.disabled=transform.k<=.551;updateLabels();
    });
    svg.call(zoom).on('dblclick.zoom',null);updatePositions();
  }

  function hideSearch(){ui.results.hidden=true;ui.search.setAttribute('aria-expanded','false');}
  function matches(query){const q=normalize(query);return q?sorted(nodes).map(node=>({node,rank:normalize(node.id)===q?0:normalize(node.id).startsWith(q)?1:normalize(node.id).includes(q)?2:3})).filter(item=>item.rank<3).sort((a,b)=>a.rank-b.rank).slice(0,12).map(item=>item.node):[];}
  function choose(node){ui.search.value=node.id;hideSearch();ui.search.focus({preventScroll:true});selectNode(node.id);centerSelection();}
  function showSearch(){
    ui.results.replaceChildren();if(!ui.search.value.trim()){hideSearch();return;}
    const list=matches(ui.search.value);
    if(!list.length){const p=document.createElement('p');p.className='empty-search';p.textContent='No se encontró ese nombre en el archivo. Prueba con otro personaje.';ui.results.append(p);}
    list.forEach(node=>{const entry=button(node.id,'search-result',()=>choose(node));const small=document.createElement('small');small.textContent=`${node.degree} vecinos · red completa`;entry.append(small);ui.results.append(entry);});
    ui.results.hidden=false;ui.search.setAttribute('aria-expanded','true');
  }

  async function start(){
    if(!window.d3?.zoom)throw Error('No se ha cargado la biblioteca de la red. Recarga la página desde el servidor local.');
    const response=await fetch('../../Datos/processed/miserables_network.json');
    if(!response.ok)throw Error('No se pudo leer la red. Ejecuta prepare_data.cjs y abre la página desde el servidor local.');
    const data=await response.json();nodes=data.nodes.map(node=>({...node}));links=data.links.map(edge=>({...edge}));
    byId=new Map(nodes.map(node=>[node.id,node]));adjacency=new Map(nodes.map(node=>[node.id,new Set()]));const pairs=new Set();
    for(const edge of links){
      if(!byId.has(edge.source)||!byId.has(edge.target)||edge.source===edge.target)throw Error('Hay una relación no válida en la red.');
      const pair=[edge.source,edge.target].sort().join('\u0000');if(pairs.has(pair))throw Error('Hay una relación repetida en la red.');pairs.add(pair);
      adjacency.get(edge.source).add(edge.target);adjacency.get(edge.target).add(edge.source);
    }
    if(nodes.length!==77 || byId.size!==77 || links.length!==254 || nodes.some(node=>node.degree!==adjacency.get(node.id).size || ![node.x,node.y,node.r].every(Number.isFinite) || node.r<=0))throw Error('La red no coincide con los 77 personajes y 254 relaciones validados.');
    baseline=new Map(nodes.map(node=>[node.id,{x:node.x,y:node.y}]));transform=d3.zoomIdentity;
    visibleIds=new Set(nodes.map(node=>node.id));draw();renderState();
    const legend=d3.select('#size-legend'),factor=data.metadata.layout.radius_coefficient*.62;
    [1,10,36].forEach((degree,index)=>{const x=30+index*72;legend.append('circle').attr('cx',x).attr('cy',28).attr('r',factor*Math.sqrt(degree)).attr('fill','#478b8d').attr('fill-opacity',.8);legend.append('text').attr('x',x).attr('y',60).attr('text-anchor','middle').attr('fill','#526775').attr('font-size',11).text(degree);});
    const leaders=sorted(nodes);$('insight').textContent=`${leaders[0].id} tiene ${leaders[0].degree} vecinos distintos, el mayor grado de esta red. Le siguen ${leaders[1].id}, con ${leaders[1].degree}, y ${leaders[2].id}, con ${leaders[2].degree}. Selecciona un personaje para comprobar sus conexiones, sin convertir ese recuento en un juicio sobre su importancia en la novela.`;
    for(const control of [ui.search,ui.reset,ui.zoomIn,ui.zoomOut,ui.fit])control.disabled=false;
    new ResizeObserver(updateLabels).observe(ui.svg);
    window.characterNetwork={nodes,links,adjacency,selectNode,get selected(){return selected;},get subset(){return subset;},get visibleIds(){return [...visibleIds];},get transform(){return {x:transform.x,y:transform.y,k:transform.k};}};
  }

  ui.search.addEventListener('input',showSearch);
  ui.search.addEventListener('keydown',event=>{
    if(event.key==='Escape'){hideSearch();ui.search.value='';}
    if(event.key==='Enter'){const node=matches(ui.search.value)[0];if(node){event.preventDefault();choose(node);}}
    if(event.key==='ArrowDown' && !ui.results.hidden){const first=ui.results.querySelector('button');if(first){event.preventDefault();first.focus();}}
  });
  ui.results.addEventListener('keydown',event=>{
    const items=[...ui.results.querySelectorAll('button')],index=items.indexOf(document.activeElement);
    if(event.key==='ArrowDown'){event.preventDefault();items[Math.min(index+1,items.length-1)]?.focus();}
    if(event.key==='ArrowUp'){event.preventDefault();if(index<=0)ui.search.focus();else items[index-1].focus();}
    if(event.key==='Escape'){hideSearch();ui.search.focus();}
  });
  document.addEventListener('click',event=>{if(event.target!==ui.search && !ui.results.contains(event.target))hideSearch();});
  ui.neighborhood.addEventListener('click',()=>{if(!selected)return;subset=!subset;renderState();fitVisible();});
  ui.clear.addEventListener('click',()=>{selected=null;subset=false;ui.search.value='';hideSearch();renderState();fitVisible();});
  ui.reset.addEventListener('click',()=>{for(const node of nodes)Object.assign(node,baseline.get(node.id));selected=null;subset=false;ui.search.value='';hideSearch();updatePositions();renderState();applyTransform(d3.zoomIdentity);});
  ui.zoomIn.addEventListener('click',()=>zoomBy(1.35));
  ui.zoomOut.addEventListener('click',()=>zoomBy(1/1.35));
  ui.fit.addEventListener('click',fitVisible);ui.center.addEventListener('click',centerSelection);
  start().catch(error=>{console.error(error);ui.status.textContent=error.message;});
})();
