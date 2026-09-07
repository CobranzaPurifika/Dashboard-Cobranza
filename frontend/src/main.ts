import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideZoneChangeDetection } from '@angular/core';
import { provideIonicAngular } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  analyticsOutline,
  callOutline,
  chevronDownOutline,
  chevronForwardOutline,
  chevronUpOutline,
  closeOutline,
  colorPaletteOutline,
  expandOutline,
  logInOutline,
  logOutOutline,
  moonOutline,
  peopleOutline,
  refreshOutline,
  searchOutline,
  settingsOutline,
  sunnyOutline,
  waterOutline,
} from 'ionicons/icons';

import { AppComponent } from './app/app.component';

addIcons({
  analyticsOutline,
  callOutline,
  chevronDownOutline,
  chevronForwardOutline,
  chevronUpOutline,
  closeOutline,
  colorPaletteOutline,
  expandOutline,
  logInOutline,
  logOutOutline,
  moonOutline,
  peopleOutline,
  refreshOutline,
  searchOutline,
  settingsOutline,
  sunnyOutline,
  waterOutline,
});

bootstrapApplication(AppComponent, {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideIonicAngular({ mode: 'md' }),
  ],
})
  .catch((error) => console.error(error));
