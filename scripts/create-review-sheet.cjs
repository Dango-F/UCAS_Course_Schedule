const sharp = require(process.env.SHARP_MODULE || 'sharp');
const fs = require('node:fs');
const path = require('node:path');
(async()=>{
  const base=path.resolve('.artifacts/screenshots');
  fs.mkdirSync(path.resolve('docs/preview'),{recursive:true});
  const main=await sharp(path.join(base,'home-390.png')).resize(390,844).toBuffer();
  const detail=await sharp(path.join(base,'course-detail.png')).resize(390,844).toBuffer();
  await sharp({create:{width:828,height:876,channels:4,background:'#e9eef4'}}).composite([{input:main,left:16,top:16},{input:detail,left:422,top:16}]).png().toFile('docs/preview/key-pages.png');
  const names=['home-360','home-430','dense-home','dense-evening','conflict-home','conflict-detail','long-course-detail','empty-home','import-intro','today','semester','settings'];
  const layers=[];
  for(let i=0;i<names.length;i++)layers.push({input:await sharp(path.join(base,names[i]+'.png')).resize({width:195,height:422,fit:'contain',background:'#fff'}).toBuffer(),left:12+(i%4)*207,top:12+Math.floor(i/4)*434});
  await sharp({create:{width:840,height:1314,channels:4,background:'#e9eef4'}}).composite(layers).png().toFile('docs/preview/all-states.png');
  console.log('docs/preview/key-pages.png and all-states.png');
})().catch(e=>{console.error(e);process.exit(1)});
