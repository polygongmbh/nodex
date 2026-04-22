export type AppPreferenceKey = "presence" | "undoSend" | "autoCaption";
export type AppPreferenceSurface = "desktop" | "mobile";

export interface AppPreferenceDefinition {
  key: AppPreferenceKey;
  id: string;
  labelKey: string;
  descriptionKey: string;
  surfaces: AppPreferenceSurface[];
}

export const APP_PREFERENCE_DEFINITIONS: AppPreferenceDefinition[] = [
  {
    key: "presence",
    id: "presence-enabled",
    labelKey: "auth.menu.preferences.presenceLabel",
    descriptionKey: "auth.profile.presenceDescription",
    surfaces: ["desktop", "mobile"],
  },
  {
    key: "undoSend",
    id: "publish-delay-enabled",
    labelKey: "auth.menu.preferences.undoSendLabel",
    descriptionKey: "auth.profile.undoSendDescription",
    surfaces: ["desktop", "mobile"],
  },
  {
    key: "autoCaption",
    id: "auto-caption-enabled",
    labelKey: "auth.menu.preferences.autoCaptionLabel",
    descriptionKey: "auth.profile.autoCaptionDescription",
    surfaces: ["desktop"],
  },
];

export function getAppPreferenceDefinitions(surface: AppPreferenceSurface): AppPreferenceDefinition[] {
  return APP_PREFERENCE_DEFINITIONS.filter((definition) => definition.surfaces.includes(surface));
}
