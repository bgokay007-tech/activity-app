// Feature flags — set to true to open, false to show maintenance screen.
// Change here and redeploy to gradually unlock features.

export const ENABLED_CATEGORIES = {
    sports: true,
    social: false,
    arts:   false,
    games:  false,
};

export const ENABLED_SUBS = {
    // Sports
    tennis:     true,
    padel:      true,
    volleyball:  true,
    football:   false,
    basketball: false,
    // Arts
    music:      false,
    // Games
    fps:        false,
};

export const MAINTENANCE_MESSAGE = {
    tr: 'Bu alan yakında açılacak. Bizi takipte kalın! 🚀',
    en: 'This section is coming soon. Stay tuned! 🚀',
};
