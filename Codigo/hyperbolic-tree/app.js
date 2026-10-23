/* Flare Hyperbolic Tree. The upstream hierarchy in Datos/raw is read without modification. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const ui = {tree:$('tree'), status:$('status'), search:$('search'), results:$('search-results'), title:$('detail-title'), type:$('detail-type'), breadcrumb:$('breadcrumb'), depth:$('metric-depth'), childrenMetric:$('metric-children'), descendants:$('metric-descendants'), children:$('children'), childrenCount:$('children-count'), reset:$('reset'), parent:$('parent'), previous:$('previous')};
  const dataUrl = '../../Datos/raw/d3_hierarchy_flare.json';
  let chart, root, selected, previous, nodes=[];
  let moving=false, pending=null, selectionMarker;

  function updateSelectionMarker(){
    if(!selectionMarker || !selected)return;
    const point=chart.args.geometry.transformation.transformPoint(selected.layout.z);
    selectionMarker.setAttribute('cx',point.re);
    selectionMarker.setAttribute('cy',point.im);
  }

  function pathOf(node) { return node.ancestors().reverse().map(part => part.data.name).join(' / '); }
  function safeName(node) { return String(node.data.name || 'Sin nombre'); }
  function clear(element) { element.replaceChildren(); }
  function button(text, cls, callback) { const el=document.createElement('button'); el.type='button'; el.className=cls; el.textContent=text; el.addEventListener('click',callback); return el; }

  function renderSelection(node) {
    selected=node;
    const kids=node.children || [];
    const route=node.ancestors().reverse();
    ui.title.textContent=safeName(node);
    ui.type.textContent=(node===root?'Raíz · ':node.children?'Paquete · ':'Clase · ')+pathOf(node);
    ui.depth.textContent=String(node.depth);
    ui.childrenMetric.textContent=String(kids.length);
    ui.descendants.textContent=String(node.descendants().length-1);
    ui.childrenCount.textContent=kids.length ? `${kids.length} ${kids.length===1?'elemento':'elementos'}` : '';
    ui.parent.disabled=!node.parent;
    ui.previous.disabled=!previous;
    clear(ui.breadcrumb);
    route.forEach((part,index)=>{
      if(index){const sep=document.createElement('span');sep.className='sep';sep.setAttribute('aria-hidden','true');sep.textContent='›';ui.breadcrumb.append(sep);}
      if(part===node){const label=document.createElement('span');label.className='current';label.textContent=safeName(part);ui.breadcrumb.append(label);}
      else ui.breadcrumb.append(button(safeName(part),'breadcrumb-link',()=>focusNode(part)));
    });
    clear(ui.children);
    if(!kids.length){const empty=document.createElement('p');empty.className='empty-children';empty.textContent='Esta clase no tiene elementos hijos.';ui.children.append(empty);}
    else kids.slice().sort((a,b)=>safeName(a).localeCompare(safeName(b),'es')).forEach(child=>{
      const item=button(safeName(child),'child-button',()=>focusNode(child));
      const kind=document.createElement('span');kind.textContent=child.children?`${child.children.length} hijos`:'clase';item.append(kind);ui.children.append(item);
    });
    updateSelectionMarker();
  }

  async function focusNode(node,{history=true}={}) {
    if(!chart || !node) return;
    if(moving){ pending={node,history}; return; }
    if(history && selected && node!==selected) previous=selected;
    renderSelection(node);
    ui.status.textContent=`Foco: ${pathOf(node)}.`;
    moving=true;
    try {
      if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
        await (node===root?chart.api.gotoHome():chart.api.gotoNode(node));
      }
      // Upstream animation ends at sigmoid(1), slightly short of its target.
      // Set the exact Möbius translation so the selected point reaches 0.
      const transform=chart.args.geometry.transformation;
      const theta=transform.state.θ;
      const z=node.layout.z;
      transform.state.P.re=-(theta.re*z.re-theta.im*z.im);
      transform.state.P.im=-(theta.re*z.im+theta.im*z.re);
      chart.update.transformation();
    }
    catch(error){console.error(error);ui.status.textContent='No se pudo cambiar el foco. Puedes elegir otro elemento.';}
    finally { moving=false; if(pending){const next=pending;pending=null;focusNode(next.node,{history:next.history});} }
  }

  function searchMatches(query){
    const q=query.trim().toLocaleLowerCase('es');
    if(!q)return [];
    return nodes.map((node,index)=>{
      const name=safeName(node).toLocaleLowerCase('es');
      const path=pathOf(node).toLocaleLowerCase('es');
      const rank=name===q?0:name.startsWith(q)?1:name.includes(q)?2:path.includes(q)?3:4;
      return {node,index,rank};
    }).filter(result=>result.rank<4)
      .sort((a,b)=>a.rank-b.rank || a.index-b.index)
      .slice(0,12).map(result=>result.node);
  }
  function hideResults(){ui.results.hidden=true;ui.search.setAttribute('aria-expanded','false');}
  function showResults(){
    const query=ui.search.value.trim();clear(ui.results);
    if(!query){hideResults();return;}
    const matches=searchMatches(query);
    if(!matches.length){const empty=document.createElement('div');empty.className='search-empty';empty.textContent='No se encontraron paquetes ni clases.';ui.results.append(empty);}
    matches.forEach((node,index)=>{
      const item=button(safeName(node),'search-result',()=>chooseResult(node));
      item.id=`result-${index}`;
      const route=document.createElement('small');route.textContent=pathOf(node);item.append(route);ui.results.append(item);
    });
    ui.results.hidden=false;ui.search.setAttribute('aria-expanded','true');
  }
  function chooseResult(node){ui.search.value=safeName(node);hideResults();focusNode(node);}

  function validateHierarchy(data){
    if(!data || data.name!=='flare' || !Array.isArray(data.children)) throw Error('El archivo Flare no tiene la estructura esperada.');
    const seen=new Set(), stack=[{item:data,path:data.name}];let count=0,leaves=0,maxDepth=0;
    while(stack.length){const {item,path}=stack.pop();if(seen.has(path))throw Error('Hay rutas repetidas en Flare.');seen.add(path);count++;const depth=path.split('/').length-1;maxDepth=Math.max(maxDepth,depth);if(!item.children?.length)leaves++;else item.children.forEach(child=>stack.push({item:child,path:`${path}/${child.name}`}));}
    if(count!==252 || leaves!==220 || maxDepth!==4) throw Error(`La estructura Flare ha cambiado: ${count} nodos, ${leaves} hojas, profundidad ${maxDepth}.`);
    $('node-count').textContent=String(count);$('leaf-count').textContent=String(leaves);$('level-count').textContent=String(maxDepth+1);
  }

  async function start(){
    if(!window.hyt?.Hypertree)throw Error('No se ha cargado la biblioteca del árbol hiperbólico.');
    const response=await fetch(dataUrl);if(!response.ok)throw Error(`No se pudo leer Flare (HTTP ${response.status}). Abre la página mediante el servidor local.`);
    const data=await response.json();validateHierarchy(data);
    chart=new hyt.Hypertree({parent:ui.tree},{
      dataloader:(ok)=>ok(data),
      langInitBFS:(ht,n)=>{n.precalc.label=safeName(n);n.precalc.wiki=undefined;},
      filter:{maxlabels:28},
      geometry:{layerOptions:{'stem-arc':{invisible:true}}},
      interaction:{onNodeSelect:n=>focusNode(n)}
    });
    await chart.initPromise;
    root=chart.data;nodes=root.descendants();
    if(nodes.length!==252)throw Error('La biblioteca no ha cargado todos los nodos.');
    chart.drawDetailFrame();
    selectionMarker=document.createElementNS('http://www.w3.org/2000/svg','circle');
    selectionMarker.setAttribute('class','selection-marker');
    selectionMarker.setAttribute('r','.021');
    selectionMarker.setAttribute('aria-hidden','true');
    ui.tree.querySelector('#nodes').parentElement.append(selectionMarker);
    const updateTransformation=chart.update.transformation;
    chart.update.transformation=()=>{updateTransformation();updateSelectionMarker();};
    renderSelection(root);
    ui.status.textContent='Árbol listo. Selecciona un nodo, usa la búsqueda o explora las ramas.';
    window.flareTree={chart,root,nodes,get selected(){return selected;},focusNode,pathOf};
  }

  ui.search.addEventListener('input',showResults);
  ui.search.addEventListener('keydown',event=>{
    if(event.key==='Escape'){hideResults();ui.search.value='';}
    if(event.key==='Enter'){const match=searchMatches(ui.search.value)[0];if(match){event.preventDefault();chooseResult(match);}}
    if(event.key==='ArrowDown' && !ui.results.hidden){const first=ui.results.querySelector('button');if(first){event.preventDefault();first.focus();}}
  });
  ui.results.addEventListener('keydown',event=>{
    const items=[...ui.results.querySelectorAll('button')],index=items.indexOf(document.activeElement);
    if(event.key==='ArrowDown'){event.preventDefault();items[Math.min(index+1,items.length-1)]?.focus();}
    if(event.key==='ArrowUp'){event.preventDefault();if(index<=0)ui.search.focus();else items[index-1].focus();}
    if(event.key==='Escape'){hideResults();ui.search.focus();}
  });
  document.addEventListener('click',event=>{if(!ui.results.contains(event.target) && event.target!==ui.search)hideResults();});
  ui.reset.addEventListener('click',()=>focusNode(root));
  ui.parent.addEventListener('click',()=>focusNode(selected?.parent));
  ui.previous.addEventListener('click',()=>{if(previous){const target=previous;previous=selected;focusNode(target,{history:false});}});
  let pointerStart=null;
  ui.tree.addEventListener('pointerdown',event=>{pointerStart={x:event.clientX,y:event.clientY,id:event.pointerId};},{capture:true});
  window.addEventListener('pointercancel',()=>{pointerStart=null;},{capture:true});
  window.addEventListener('pointerup',event=>{
    if(!pointerStart || event.pointerId!==pointerStart.id)return;
    const dragged=Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>6;
    pointerStart=null;
    if(dragged){
      requestAnimationFrame(()=>{
        const center=chart?.args.geometry.transformation.cache.centerNode;
        if(center && center!==selected && !moving){
          previous=selected;
          renderSelection(center);
          ui.status.textContent=`Foco tras arrastrar: ${pathOf(center)}.`;
        }
      });
      return;
    }
    if(!ui.tree.contains(event.target))return;
    let best=null,bestDistance=14;
    for(const circle of ui.tree.querySelectorAll('circle.node')){
      const rect=circle.getBoundingClientRect();
      const distance=Math.hypot(event.clientX-(rect.left+rect.width/2),event.clientY-(rect.top+rect.height/2));
      if(distance<bestDistance && circle.__data__?.data){best=circle.__data__;bestDistance=distance;}
    }
    if(best){event.preventDefault();event.stopPropagation();focusNode(best);}
  },{capture:true});
  start().catch(error=>{console.error(error);ui.status.textContent=error.message;});
})();
