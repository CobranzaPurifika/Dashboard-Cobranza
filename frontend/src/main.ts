import { bootstrapApplication } from '@angular/platform-browser';
import { ChangeDetectorRef, NgZone, provideZoneChangeDetection } from '@angular/core';
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
  flagOutline,
  logInOutline,
  logOutOutline,
  moonOutline,
  optionsOutline,
  pauseOutline,
  peopleOutline,
  playOutline,
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
  flagOutline,
  logInOutline,
  logOutOutline,
  moonOutline,
  optionsOutline,
  pauseOutline,
  peopleOutline,
  playOutline,
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
  .then((appRef) => {
    // Angular's built-in NgZoneChangeDetectionScheduler does not trigger a repaint on its own in
    // this build (zone tasks are tracked correctly -- onMicrotaskEmpty fires as expected -- but
    // nothing reacts to it, so the view never updates after an async change unless something
    // unrelated happens to trigger change detection). This restores that behavior explicitly.
    //
    // ComponentRef.changeDetectorRef refers to the component's *host* view, not the view that
    // actually owns its template bindings -- calling detectChanges() on it is a silent no-op.
    // Resolving ChangeDetectorRef through the component's own injector instead returns the same
    // instance the component receives via constructor injection, which does refresh the view.
    const ngZone = appRef.injector.get(NgZone);
    ngZone.onMicrotaskEmpty.subscribe(() => {
      if (appRef.destroyed) return;
      for (const componentRef of appRef.components) {
        componentRef.injector.get(ChangeDetectorRef).markForCheck();
      }
      appRef.tick();
    });
  })
  .catch((error) => console.error(error));
