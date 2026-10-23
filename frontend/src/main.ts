import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, Routes } from '@angular/router';
import { AppComponent } from './app';

const routes: Routes = [
  { path: '', component: AppComponent }, { path: 'shop', component: AppComponent }, { path: 'salon', component: AppComponent },
  { path: 'booking', component: AppComponent }, { path: 'login', component: AppComponent }, { path: 'cart', component: AppComponent },
  { path: 'product/:id', component: AppComponent }, { path: 'admin', component: AppComponent }, { path: '**', component: AppComponent }
];
bootstrapApplication(AppComponent, { providers: [provideHttpClient(), provideRouter(routes)] }).catch(err => console.error(err));
