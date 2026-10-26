import {Component,Input} from '@angular/core';
const paths:Record<string,string>={
  search:'m21 21-4.5-4.5 M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0',
  cart:'M3 3h2l3 12h11l3-9H6 M9 21h.01 M19 21h.01',heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8',
  user:'M20 21v-2a7 7 0 0 0-14 0v2 M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',menu:'M4 6h16 M4 12h16 M4 18h16',arrow:'M4 12h16 M14 6l6 6-6 6',
  home:'m3 10 9-7 9 7v11h-7v-7h-4v7H3Z',grid:'M3 3h7v7H3Z M14 3h7v7h-7Z M3 14h7v7H3Z M14 14h7v7h-7Z',
  calendar:'M4 5h16v16H4Z M8 2v6 M16 2v6 M4 10h16 M8 14h2 M14 14h2 M8 18h2',scissors:'m8 8 12 12 M8 16 12 4 M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  bolt:'m13 2-9 12h7l-1 8 10-12h-7Z',shield:'m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z m-4 10 3 3 5-6',truck:'M1 4h13v12H1Z M14 9h5l4 5v2h-9 M7 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M21 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  lipstick:'M8 12h8v10H8Z M9 12V4l6-3v11 M7 16h10',bottle:'M9 3h6v4H9Z M8 7h8l2 4v10H6V11Z M9 14h6',perfume:'M10 2h4v4h-4Z M8 6h8v3H8Z M6 10h12l3 6-3 5H6l-3-5Z',
  leaf:'M20 3C7 1 1 9 6 16c6 8 16-1 14-13Z M3 22 16 8',hair:'M7 21C1 15 3 3 12 3s10 12 4 18 M10 5c-6 6 4 10-2 16 M14 5c-4 6 5 10 0 16',nail:'M8 11V7a4 4 0 0 1 8 0v4 M7 10h10v8a5 5 0 0 1-10 0Z',
  star:'m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z',check:'m5 12 4 4L19 6',close:'m6 6 12 12 M6 18 18 6',plus:'M12 4v16 M4 12h16',edit:'m16 3 5 5-12 12-6 1 1-6Z',upload:'M12 16V3 M7 8l5-5 5 5 M3 16v5h18v-5',logout:'M9 4H3v16h6 M9 12h12 M17 8l4 4-4 4',clock:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M12 6v6l4 2',chat:'M4 4h16v13H8l-4 3V4Z M8 9h8 M8 13h5'
  ,sun:'M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.6 5.6 7 7 M17 17l1.4 1.4 M18.4 5.6 17 7 M7 17l-1.4 1.4 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z'
  ,moon:'M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z'
};
@Component({selector:'n-icon',standalone:true,template:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="path"/></svg>`})
export class IconComponent{@Input() name='star';get path(){return paths[this.name]||paths['star']}}
