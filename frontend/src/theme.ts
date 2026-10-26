import {Injectable} from '@angular/core';

type ThemeMode='light'|'dark';

@Injectable({providedIn:'root'})
export class ThemeService{
 dark=false;
 private readonly storageKey='nirvana-theme';
 private readonly media=typeof window!=='undefined'?window.matchMedia('(prefers-color-scheme: dark)'):null;
 private readonly onSystemChange=(event:MediaQueryListEvent)=>this.apply(event.matches?'dark':'light');

 constructor(){
  const saved=this.readSaved();
  this.apply(saved||(this.media?.matches?'dark':'light'));
  if(!saved)this.media?.addEventListener?.('change',this.onSystemChange);
 }

 toggle(){
  const next:ThemeMode=this.dark?'light':'dark';
  this.apply(next);
  try{localStorage.setItem(this.storageKey,next)}catch{}
  this.media?.removeEventListener?.('change',this.onSystemChange);
 }

 private readSaved():ThemeMode|null{
  try{const value=localStorage.getItem(this.storageKey);return value==='light'||value==='dark'?value:null}catch{return null}
 }

 private apply(mode:ThemeMode){
  this.dark=mode==='dark';
  if(typeof document==='undefined')return;
  document.documentElement.setAttribute('data-theme',mode);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',this.dark?'#19151d':'#ec1678');
 }
}
