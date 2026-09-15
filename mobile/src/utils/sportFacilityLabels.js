// Spor dalına göre tesis/rezervasyon/ekipman etiketleri.
// "Aynısını tenis/padel'e uygula" derken metinleri körü körüne kopyalama —
// masa tenisinde "masa", badmintonda "Badminton Rezervasyonu" vb. olmalı
// (bkz. .cursor/rules/spor-ozel-etiket.mdc).

export function sportFacilityLabels(sub, t) {
    if (sub === 'table_tennis') {
        return {
            noun: t.tableTennisTableLabel,
            reserved: t.tableTennisReservedLabel,
            notReserved: t.tableTennisNotReserved,
            promptQ: t.tableTennisReservedPromptQ,
            searchPh: t.tableTennisSearchPlaceholder,
            manualLabel: t.tableTennisManualLabel,
            specifyBtn: t.tableTennisSpecifyBtn,
            feeLabel: t.tableTennisFeeLabel,
            resBtn: t.venueResBtnTableTennis,
            sportNamedEquipment: true,
        };
    }
    if (sub === 'badminton') {
        return {
            noun: t.badmintonCourtLabel,
            reserved: t.badmintonReservedLabel,
            notReserved: t.badmintonNotReserved,
            promptQ: t.badmintonReservedPromptQ,
            searchPh: t.badmintonSearchPlaceholder,
            manualLabel: t.badmintonManualLabel,
            specifyBtn: t.badmintonSpecifyBtn,
            feeLabel: t.badmintonFeeLabel,
            resBtn: t.venueResBtnBadminton,
            sportNamedEquipment: true,
        };
    }
    if (sub === 'volleyball') {
        return {
            noun: t.volleyballHallLabel,
            reserved: t.volleyballHallReservedLabel,
            notReserved: t.courtNotReserved,
            promptQ: t.volleyballReservedPromptQ,
            searchPh: null,
            manualLabel: null,
            specifyBtn: t.courtSpecifyBtn,
            feeLabel: t.courtFeeLabel,
            resBtn: null,
            sportNamedEquipment: true,
        };
    }
    if (sub === 'padel') {
        return {
            noun: t.courtLabel,
            reserved: t.courtReservedLabel,
            notReserved: t.courtNotReserved,
            promptQ: t.courtReservedPromptQ,
            searchPh: t.courtSearchPlaceholder,
            manualLabel: t.manualCourtLabel,
            specifyBtn: t.courtSpecifyBtn,
            feeLabel: t.courtFeeLabel,
            resBtn: t.venueResBtnCourt,
            sportNamedEquipment: true,
        };
    }
    return {
        noun: t.courtLabel,
        reserved: t.courtReservedLabel,
        notReserved: t.courtNotReserved,
        promptQ: t.courtReservedPromptQ,
        searchPh: t.courtSearchPlaceholder,
        manualLabel: t.manualCourtLabel,
        specifyBtn: t.courtSpecifyBtn,
        feeLabel: t.courtFeeLabel,
        resBtn: t.venueResBtnCourt,
        sportNamedEquipment: false,
    };
}

export function sportEquipmentTabLabel(sub, sportDisplayName, lang, t) {
    const fac = sportFacilityLabels(sub, t);
    if (fac.sportNamedEquipment) {
        if (lang === 'tr') return `${sportDisplayName} Ekipmanları`;
        if (lang === 'ru') return `${sportDisplayName} инвентарь`;
        if (lang === 'de') return `${sportDisplayName} Ausrüstung`;
        return `${sportDisplayName} Equipment`;
    }
    return t.equipmentTab;
}
