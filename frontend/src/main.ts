import { bootstrapApplication } from '@angular/platform-browser';
import { provideIonicAngular } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  analyticsOutline,
  callOutline,
  chevronForwardOutline,
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
  chevronForwardOutline,
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

bootstrapApplication(AppComponent, { providers: [provideIonicAngular({ mode: 'md' })] })
  .catch((error) => console.error(error));
