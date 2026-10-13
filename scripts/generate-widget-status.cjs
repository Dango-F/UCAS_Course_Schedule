// Generate native RemoteViews lamp frames from the app header's shared tokens.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root,'src/styles/status-light.scss'),'utf8');
const token = name => source.match(new RegExp('\\$status-light-'+name+':\\s*([^;]+);'))[1].trim();
const green = token('green'), yellow = token('yellow'), gray = token('gray');
const size = Number(token('size')), halo = Number(token('halo')), period = Number(token('period'));
const extent = size + halo * 2, center = extent / 2, frames = 20;
const detailedExtent = Number((extent * 6 / size).toFixed(2));
const res = path.join(root,'src/uni_modules/lakeside-widget/utssdk/app-android/res');
const save = (dir,name,value) => fs.writeFileSync(path.join(res,dir,name+'.xml'),value+'\n');
const num = x => x.toFixed(4).replace(/0+$/,'').replace(/\.$/,'');
const circle = radius => `M${num(center-radius)},${num(center)} A${num(radius)},${num(radius)} 0,1 0 ${num(center+radius)},${num(center)} A${num(radius)},${num(radius)} 0,1 0 ${num(center-radius)},${num(center)}`;
const alphaColor = (color,a) => '#'+Math.round(a*255).toString(16).padStart(2,'0')+color.slice(1);
// CSS ease-in-out = cubic-bezier(.42,0,.58,1), inverted in the time axis.
function ease(x) { let lo=0,hi=1; for(let n=0;n<24;n++){const t=(lo+hi)/2,v=3*(1-t)**2*t*.42+3*(1-t)*t*t*.58+t**3;if(v<x)lo=t;else hi=t;}const t=(lo+hi)/2;return 3*(1-t)*t*t+t**3; }
const vector = paths => `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="${extent}dp" android:height="${extent}dp" android:viewportWidth="${extent}" android:viewportHeight="${extent}">${paths}</vector>`;
for(let i=0;i<frames;i++){
  const phase=i/frames, p=phase<=.5?ease(phase*2):1-ease((phase-.5)*2);
  const paths=`<path android:fillColor="${alphaColor(green,.3*(1-p))}" android:pathData="${circle(size/2+halo*p)}"/><path android:fillColor="${alphaColor(green,.8+.2*p)}" android:pathData="${circle(size/2*(.88+.12*p))}"/>`;
  save('drawable','ls_widget_light_'+i,vector(paths));
}
for(const [state,color] of [['pending',yellow],['ended',gray]]){
  save('drawable','ls_widget_light_'+state,vector(`<path android:fillColor="${color}" ${state==='ended'?'android:strokeColor="#b5bcc5" android:strokeWidth="0.6" ':''}android:pathData="${circle(size/2)}"/>`));
  save('layout','ls_widget_status_'+state,`<ImageView xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="${detailedExtent}dp" android:layout_height="${detailedExtent}dp" android:layout_gravity="center" android:src="@drawable/ls_widget_light_${state}" android:importantForAccessibility="no"/>`);
}
save('layout','ls_widget_status_active',`<ViewFlipper xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="${detailedExtent}dp" android:layout_height="${detailedExtent}dp" android:layout_gravity="center" android:autoStart="true" android:flipInterval="${period/frames}" android:importantForAccessibility="no">${Array.from({length:frames},(_,i)=>`<ImageView android:layout_width="match_parent" android:layout_height="match_parent" android:src="@drawable/ls_widget_light_${i}" android:importantForAccessibility="no"/>`).join('')}</ViewFlipper>`);
save('layout','ls_widget_status_active_static',`<ImageView xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="${detailedExtent}dp" android:layout_height="${detailedExtent}dp" android:layout_gravity="center" android:src="@drawable/ls_widget_light_10" android:importantForAccessibility="no"/>`);
// Scale shared vectors to ~6dp detailed and ~5dp compact cores.
// App header tokens and the shared animation remain unchanged.
const smallExtent = Number((extent * 5 / size).toFixed(2));
for (const state of ['pending','ended']) {
  save('layout','ls_widget_status_'+state+'_small',`<ImageView xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="${smallExtent}dp" android:layout_height="${smallExtent}dp" android:layout_gravity="center" android:src="@drawable/ls_widget_light_${state}" android:importantForAccessibility="no"/>`);
}
save('layout','ls_widget_status_active_small',`<ViewFlipper xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="${smallExtent}dp" android:layout_height="${smallExtent}dp" android:layout_gravity="center" android:autoStart="true" android:flipInterval="${period/frames}" android:importantForAccessibility="no">${Array.from({length:frames},(_,i)=>`<ImageView android:layout_width="match_parent" android:layout_height="match_parent" android:src="@drawable/ls_widget_light_${i}" android:importantForAccessibility="no"/>`).join('')}</ViewFlipper>`);
save('layout','ls_widget_status_active_small_static',`<ImageView xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="${smallExtent}dp" android:layout_height="${smallExtent}dp" android:layout_gravity="center" android:src="@drawable/ls_widget_light_10" android:importantForAccessibility="no"/>`);
console.log('Generated widget status lights from shared header tokens: green/yellow/gray, '+period+'ms.');
