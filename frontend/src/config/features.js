// Feature flags — set to true to open, false to show maintenance screen.
// Change here and redeploy to gradually unlock features.

export const ENABLED_CATEGORIES = {
    sports: true,
    social: true,
    arts:   true,
    games:  true,
};

export const ENABLED_SUBS = {
    // Sports
    tennis:     true,
    padel:      true,
    volleyball:  true,
    football:   false,
    basketball: false,
    // Social
    friend_finding: true,
    sanal_alem: true,
    // Arts
    music:      true,
    // Games
    fps:        false,
};

export const MAINTENANCE_MESSAGE = {
    tr: 'Bu alan yakında açılacak. Bizi takipte kalın! 🚀',
    en: 'This section is coming soon. Stay tuned! 🚀',
};
