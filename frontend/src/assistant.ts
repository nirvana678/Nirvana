import {Component, Input, Output, EventEmitter, inject, ChangeDetectorRef} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {StoreApi} from './api';
import {IconComponent} from './icon';

type Reply = {answer:string; mode:'guided'|'ai'; products:any[]; salonists:any[]; orders:any[]; cart:any; draft:any};
type Message = {role:'user'|'assistant'; content:string; result?:Reply};

@Component({selector:'nirvana-assistant', standalone:true, imports:[CommonModule,FormsModule,RouterLink,IconComponent], templateUrl:'./assistant.html'})
export class AssistantComponent {
  api=inject(StoreApi);
  cdr=inject(ChangeDetectorRef);
  @Input() mode:'customer'|'admin'='customer';
  @Input() cart:{product:any;quantity:number}[]=[];
  @Input() fulfilment:'delivery'|'pickup'='delivery';
  @Input() heading='Ask Nirvana';
  @Input() description='Find a lovely match, understand your order, or plan your next salon visit.';
  @Output() reviewDraft=new EventEmitter<any>();
  prompt=''; busy=false; error=''; messages:Message[]=[];
  get suggestions(){return this.mode==='admin' ? [
    'Add a product called Rose Glow Lip Oil, price KSh 1200, stock 20',
    'Show products low on stock',
    'Suggest ideas for the beauty catalogue'
  ] : [
    'Calculate my cart total',
    'Show my recent orders',
    'Find pink lip products',
    'Suggest a salonist and a beauty look'
  ]}
  ask(value?:string){
    if(value)this.prompt=value;
    const message=this.prompt.trim();
    if(!message||this.busy||!this.api.user)return;
    const history=this.messages.slice(-6).map(item=>({role:item.role,content:item.content}));
    this.messages.push({role:'user',content:message});
    this.prompt='';this.error='';this.busy=true;
    this.api.post<Reply>('/assistant/ask',{message,history,cart:this.mode==='customer'?this.cart.map(item=>({productId:item.product._id,quantity:item.quantity})):[],fulfilment:this.fulfilment}).subscribe({
      next:result=>{this.messages.push({role:'assistant',content:result.answer,result});this.busy=false;this.cdr.markForCheck();this.scrollDown()},
      error:e=>{this.error=e.error?.error||'I could not answer right now. Please try again.';this.busy=false;this.cdr.markForCheck()}
    });
  }
  private scrollDown(){setTimeout(()=>document.querySelector('.assistant-transcript')?.scrollTo({top:100000,behavior:'smooth'}),50)}
}
