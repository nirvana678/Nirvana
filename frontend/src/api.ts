import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { tap } from 'rxjs';
import { environment } from './environment';
export interface ProductAttribute {name:string;value:string}
export interface ProductOptionGroup {name:string;values:string[]}
export interface ProductOption { _id:string; label:string; volume?:string; color?:string; details?:string; attributes?:ProductAttribute[]; image?:string; sku?:string; price?:number; compareAt?:number; stock:number; }
export interface Product { _id:string; name:string; slug:string; brand?:string; category?:string; description?:string; image?:string; price:number; compareAt?:number; stock:number; featured?:boolean; rating?:number; colours?:string[]; variants?:string[]; optionGroups?:ProductOptionGroup[]; options?:ProductOption[]; matchedOptions?:ProductOption[]; salonUsable?:boolean; salonService?:string; }
export interface SalonService { _id:string; name:string; category?:string; description?:string; image?:string; durationMinutes:number; price:number; }
export interface Salonist { _id:string; name:string; bio?:string; phone?:string; specialties?:string[]; image?:string; services?:any[]; chatAvailable?:boolean; }
@Injectable({providedIn:'root'})
export class StoreApi {
  http=inject(HttpClient); base=environment.apiUrl;
  token=sessionStorage.getItem('nirvana-token')||'';
  user:any=(()=>{try{return JSON.parse(sessionStorage.getItem('nirvana-user')||'null')}catch{return null}})();
  constructor(){if(!this.hasActiveSession())this.logout()}
  hasActiveSession(){try{const payload=JSON.parse(atob(this.token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));return Boolean(this.user&&payload.exp*1000>Date.now())}catch{return false}}
  headers(){return new HttpHeaders(this.token?{Authorization:`Bearer ${this.token}`}:{})}
  get<T=any>(path:string){return this.http.get<T>(`${this.base}${path}`,{headers:this.headers()})}
  post<T=any>(path:string,body:unknown){return this.http.post<T>(`${this.base}${path}`,body,{headers:this.headers()})}
  patch<T=any>(path:string,body:unknown){return this.http.patch<T>(`${this.base}${path}`,body,{headers:this.headers()})}
  put<T=any>(path:string,body:unknown){return this.http.put<T>(`${this.base}${path}`,body,{headers:this.headers()})}
  remove(path:string){return this.http.delete<any>(`${this.base}${path}`,{headers:this.headers()})}
  download(path:string){return this.http.get(`${this.base}${path}`,{headers:this.headers(),responseType:'blob'})}
  login(email:string,password:string){return this.post('/auth/login',{email,password}).pipe(tap(data=>this.saveAuth(data)))}
  register(email:string,password:string,phone:string){return this.post('/auth/register',{email,password,phone}).pipe(tap(data=>this.saveAuth(data)))}
  saveAuth(data:any){this.token=data.token;this.user=data.user;sessionStorage.setItem('nirvana-token',this.token);sessionStorage.setItem('nirvana-user',JSON.stringify(this.user))}
  logout(){this.token='';this.user=null;sessionStorage.removeItem('nirvana-token');sessionStorage.removeItem('nirvana-user')}
}
