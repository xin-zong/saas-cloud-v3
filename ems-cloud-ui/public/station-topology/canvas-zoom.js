let focusCanvasDevice;
// Shared cursor-anchored zoom for both topology views.
(()=>{
  let offset={x:0,y:0};
  const previousRender=renderCanvas;
  renderCanvas=function(){previousRender();const vb=$('#canvas').viewBox.baseVal;$('#scene').setAttribute('transform',`translate(${(vb.x+vb.width/2)*(1-zoom)+offset.x} ${(vb.y+vb.height/2)*(1-zoom)+offset.y}) scale(${zoom})`);$('#zoom-label').textContent=Math.round(zoom*100)+'%';};
  focusCanvasDevice=function(id){
    const el=[...$('#scene').querySelectorAll('[data-node],[data-pf-device]')].find(e=>(e.dataset.node||e.dataset.pfDevice)===id);if(!el)return;
    const box=el.getBBox(),vb=$('#canvas').viewBox.baseVal;
    offset={x:zoom*(vb.x+vb.width/2-box.x-box.width/2),y:zoom*(vb.y+vb.height/2-box.y-box.height/2)};renderCanvas();
  };
  function changeZoom(next,anchor){
    next=Math.max(.55,Math.min(1.65,next));if(next===zoom)return;
    const vb=$('#canvas').viewBox.baseVal,c={x:vb.x+vb.width/2,y:vb.y+vb.height/2};
    anchor=anchor||c;const ratio=next/zoom;
    offset={x:(anchor.x-c.x)*(1-ratio)+offset.x*ratio,y:(anchor.y-c.y)*(1-ratio)+offset.y*ratio};
    zoom=next;renderCanvas();
  }
  $('#canvas').addEventListener('wheel',ev=>{
    ev.preventDefault();if(!ev.deltaY)return;
    const canvas=$('#canvas'),matrix=canvas.getScreenCTM();if(!matrix)return;
    const pt=canvas.createSVGPoint();pt.x=ev.clientX;pt.y=ev.clientY;
    const delta=ev.deltaY*(ev.deltaMode===1?16:ev.deltaMode===2?canvas.clientHeight:1);
    changeZoom(zoom*Math.exp(-Math.max(-300,Math.min(300,delta))*.0015),pt.matrixTransform(matrix.inverse()));
  },{passive:false});
  actions.zoomin=()=>changeZoom(zoom+.15);actions.zoomout=()=>changeZoom(zoom-.15);
  actions.fit=()=>{zoom=1;offset={x:0,y:0};renderCanvas();};
  const previousView=setView;setView=function(...args){offset={x:0,y:0};previousView(...args);};
  const previousLayout=actions.layout;actions.layout=function(){offset={x:0,y:0};previousLayout();};
  renderCanvas();
})();
