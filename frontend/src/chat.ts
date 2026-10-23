import { Component, Input, OnDestroy, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { Subscription } from 'rxjs';
import { StoreApi, Salonist } from './api';
import { IconComponent } from './icon';

@Component({ selector: 'nirvana-chat', standalone: true, imports: [CommonModule, FormsModule, RouterLink, IconComponent], templateUrl: './chat.html' })
export class ChatComponent implements OnInit, OnDestroy {
  @Input() settings: any = {};
  api = inject(StoreApi); router = inject(Router); cdr = inject(ChangeDetectorRef);
  routeSub?: Subscription; refreshTimer?: number; paymentTimer?: number;
  conversations: any[] = []; artists: Salonist[] = []; active: any = null; messages: any[] = []; appointments: any[] = [];
  draft = ''; phone = ''; error = ''; notice = ''; paymentResultStatus = ''; busy = false; loading = true; showPayments = false; onlineAvailable = false; paymentId = '';

  ngOnInit() {
    this.routeSub = this.router.events.subscribe(event => { if (event instanceof NavigationEnd) this.routeChanged(); });
    if (this.api.user && this.api.user.role !== 'admin') {
      this.phone = this.api.user.phone || '';
      this.api.get<{onlineAvailable:boolean}>('/payments/config').subscribe({ next: value => { this.onlineAvailable = value.onlineAvailable; this.cdr.markForCheck(); } });
      this.api.get<Salonist[]>('/salon/salonists').subscribe({ next: artists => { this.artists = artists.filter(artist => artist.chatAvailable); this.cdr.markForCheck(); } });
      this.routeChanged();
      this.refreshTimer = window.setInterval(() => {
        if (document.hidden) return;
        this.loadInbox(true);
        if (this.active?._id) this.loadThread(this.active._id, true);
      }, 5000);
    }
  }

  ngOnDestroy() { this.routeSub?.unsubscribe(); if (this.refreshTimer) clearInterval(this.refreshTimer); if (this.paymentTimer) clearInterval(this.paymentTimer); }

  routeChanged() {
    if (!this.api.user) return;
    const path = this.router.url.split('?')[0];
    const id = path.startsWith('/messages/') ? path.split('/')[2] : '';
    const artist = this.router.parseUrl(this.router.url).queryParams['artist'];
    if (artist && this.api.user.role === 'customer') { this.start(artist); return; }
    this.loadInbox();
    if (id && id !== this.active?._id) this.loadThread(id);
    if (!id) { this.active = null; this.messages = []; this.showPayments = false; this.cdr.markForCheck(); }
  }

  loadInbox(silent = false) {
    this.api.get<any[]>('/messages').subscribe({ next: data => { this.conversations = data; this.loading = false; this.cdr.markForCheck(); }, error: error => { if (!silent) this.fail(error); } });
  }

  loadThread(id: string, silent = false) {
    this.api.get<any>(`/messages/${id}`).subscribe({ next: data => {
      const changed = this.active?._id !== id || this.messages.at(-1)?._id !== data.messages.at(-1)?._id;
      this.active = data.conversation; this.messages = data.messages; this.appointments = data.appointments;
      if (changed) setTimeout(() => document.querySelector('.chat-messages')?.scrollTo({top: 999999, behavior: silent ? 'smooth' : 'instant'}), 20);
      this.cdr.markForCheck();
    }, error: error => { if (!silent) this.fail(error); } });
  }

  start(salonistId: string) {
    if (this.busy) return;
    this.busy = true; this.error = '';
    this.api.post<{_id:string}>('/messages', { salonistId }).subscribe({ next: data => {
      this.busy = false; this.router.navigateByUrl(`/messages/${data._id}`, { replaceUrl: true }); this.cdr.markForCheck();
    }, error: error => this.fail(error) });
  }

  open(id: string) { this.router.navigateByUrl(`/messages/${id}`); }

  send() {
    if (!this.active || !this.draft.trim() || this.busy) return;
    this.busy = true; this.error = '';
    this.api.post(`/messages/${this.active._id}`, { body: this.draft.trim() }).subscribe({ next: () => {
      this.draft = ''; this.busy = false; this.loadThread(this.active._id); this.loadInbox(); this.cdr.markForCheck();
    }, error: error => this.fail(error) });
  }

  pay(appointment: any) {
    if (!this.onlineAvailable || !this.phone || this.busy) return;
    this.busy = true; this.error = ''; this.notice = ''; this.paymentResultStatus = 'pending';
    this.api.post<{id:string;message:string}>('/payments/start', { appointmentId: appointment._id, phone: this.phone }).subscribe({ next: data => {
      this.busy = false; this.paymentId = data.id; this.notice = data.message; this.watchPayment(); this.cdr.markForCheck();
    }, error: error => this.fail(error) });
  }

  watchPayment() {
    if (this.paymentTimer) clearInterval(this.paymentTimer);
    let attempts = 0;
    this.paymentTimer = window.setInterval(() => {
      if (!this.paymentId) { if (this.paymentTimer) clearInterval(this.paymentTimer); return; }
      if (++attempts > 24) { if (this.paymentTimer) clearInterval(this.paymentTimer); this.paymentId = ''; this.paymentResultStatus = 'pending'; this.notice = 'Payment is still pending. Please check your phone and refresh your booking later.'; this.cdr.markForCheck(); return; }
      this.api.get<{status:string;message?:string}>(`/payments/${this.paymentId}/status`).subscribe({ next: data => {
        if (data.status === 'pending') return;
        if (this.paymentTimer) clearInterval(this.paymentTimer);
        this.paymentResultStatus = data.status === 'success' ? 'success' : 'failed';
        this.notice = data.status === 'success' ? 'Payment received. Thank you!' : data.message || 'The M-Pesa payment was not completed. Please try again.';
        this.paymentId = ''; if (this.active) this.loadThread(this.active._id); this.cdr.markForCheck();
      } });
    }, 6000);
  }

  counterpart(thread: any) { return this.api.user?.role === 'salonist' ? thread.customer?.name : thread.salonist?.name; }
  avatar(thread: any) { return thread.salonist?.image || '/images/artist1.jpg'; }
  own(message: any) { return String(message.sender) === String(this.api.user?.id); }
  fail(error: any) { this.busy = false; this.error = error.error?.error || 'Could not load messages. Please try again.'; this.cdr.markForCheck(); }
}
