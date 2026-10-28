// 모바일 홈의 카드 사이 빈 공간에 원본 캐릭터 전신을 맞춘다.
export function fitMenuShowcase({width,height,hall,track,dock,header,stage,aspect=1}){
  if(height>width&&stage){
    const left=Math.max(0,stage.left)+8,right=Math.min(width,stage.right)-8;
    const top=stage.top+8,bottom=stage.bottom-8;
    if(right-left<40||bottom-top<40)return null;
    const h=Math.min(bottom-top,(right-left)/aspect);
    return{x:(left+right)/2,y:bottom,height:h,width:h*aspect};
  }
  const left=Math.max(width*.43,(hall?.right||0)+12);
  const right=Math.min(width-12,(track?.left||width)-12);
  const top=Math.max(56,(header?.bottom||0)+8);
  const bottom=Math.min(height-12,(dock?.top||height)-12);
  if(right-left<40||bottom-top<40)return null;
  const h=Math.min((bottom-top)*.94,(right-left)*.94/aspect);
  return{x:(left+right)/2,y:bottom,height:h,width:h*aspect};
}
