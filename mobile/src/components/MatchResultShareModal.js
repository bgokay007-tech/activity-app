import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
    Alert, ScrollView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useT from '../hooks/useT';
import { useSelector } from 'react-redux';
import colors from '../theme/colors';
import { buildMatchSharePayload, buildSharerDigimonPayload, matchShareMessage, BRAND_LETTER_COLORS, UTR_SHARE_SUBS } from '../utils/matchShareCard';
import {
    buildTournamentMatchSharePayload,
    tournamentMatchShareMessage,
    tournamentMatchToShareMatch,
} from '../utils/tournamentMatchShareCard';
import { shareBackgroundToDataUrl } from '../utils/matchShareBackground';
import {
    shareToWhatsApp,
    shareToWhatsAppStatus,
    shareToInstagramStory,
    shareViaSystemSheet,
    ensureGallerySave,
    PLAY_STORE_URL,
} from '../utils/directShare';
import api, { BASE_URL } from '../services/api';

const W = 1080;
const H = 1920;
const ASSET_HOST = BASE_URL.replace(/\/api\/?$/, '');

/** Uzak avatar → canvas Image için data URL (WebView CORS'u bypass). */
async function avatarToDataUrl(url) {
    if (!url || typeof url !== 'string') return null;
    try {
        let abs = url;
        if (abs.startsWith('/')) abs = `${ASSET_HOST}${abs}`;
        const dest = `${FileSystem.cacheDirectory}share-avatar-${Date.now()}.jpg`;
        const dl = await FileSystem.downloadAsync(abs, dest);
        if (!dl?.uri) return null;
        const b64 = await FileSystem.readAsStringAsync(dl.uri, {
            encoding: FileSystem.EncodingType.Base64,
        });
        const lower = String(abs).toLowerCase();
        const mime = lower.includes('.png') ? 'image/png' : 'image/jpeg';
        return `data:${mime};base64,${b64}`;
    } catch {
        return null;
    }
}

/**
 * 9:16 skor kartı — spor/zemin arka planı + yarı saydam koyu overlay,
 * skor tablosu + canlı takip istatistikleri + saat/sağlık workout paneli.
 * IG üst chrome için TOP boşluk.
 * Meta ile "Uygulamayı indir" arasında paylaşanın digimon ön/arka kartı.
 */
function cardHtml(p, bgDataUrl, avatarDataUrl) {
    const brand = p.brand || 'AcTiViTy';
    const colorsArr = p.brandColors || BRAND_LETTER_COLORS;
    const setPairs = (p.lines || []).map((line) => {
        const m = String(line).match(/(\d+)\s*[-–]\s*(\d+)/);
        return m ? [m[1], m[2]] : ['', ''];
    });
    const stats = p.shareStats || null;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=${W}, initial-scale=1"/>
</head><body style="margin:0;background:#0B0C10">
<canvas id="c" width="${W}" height="${H}"></canvas>
<script>
(function(){
  function go(bgImg, avImg){
    try{
      var canvas=document.getElementById('c');
      var ctx=canvas.getContext('2d');
      var W=${W}, H=${H}, TOP=220;

      // Spor-yüzey arka plan (toprak/sert/salon/plaj/padel…) — yarı saydam overlay ile okunur
      if(bgImg){
        var s=Math.max(W/bgImg.width, H/bgImg.height);
        var dw=bgImg.width*s, dh=bgImg.height*s;
        ctx.drawImage(bgImg, (W-dw)/2, (H-dh)/2, dw, dh);
      } else {
        ctx.fillStyle='#0B0C10'; ctx.fillRect(0,0,W,H);
      }
      ctx.fillStyle='rgba(8,10,14,0.72)';
      ctx.fillRect(0,0,W,H);
      var vg=ctx.createLinearGradient(0,0,0,H);
      vg.addColorStop(0,'rgba(8,10,14,0.55)');
      vg.addColorStop(0.35,'rgba(8,10,14,0.35)');
      vg.addColorStop(1,'rgba(8,10,14,0.82)');
      ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);

      function text(str,x,y,size,color,align,weight){
        ctx.fillStyle=color||'#F4F1EA';
        ctx.font=(weight||'900')+' '+size+'px sans-serif';
        ctx.textAlign=align||'center';
        ctx.textBaseline='alphabetic';
        ctx.fillText(String(str||''),x,y);
      }
      function roundRect(x,y,w,h,r){
        ctx.beginPath();
        ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
        ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
      }
      function panel(x,y,w,h){
        roundRect(x,y,w,h,22);
        ctx.fillStyle='rgba(22,24,31,0.78)'; ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.lineWidth=2; ctx.stroke();
      }
      function nameLines(label, maxW, size){
        ctx.font='900 '+size+'px sans-serif';
        var raw=String(label||'');
        if(raw.indexOf(' & ')>=0){
          return raw.split(' & ').map(function(p,i,a){ return i<a.length-1 ? p+' &' : p; });
        }
        if(ctx.measureText(raw).width<=maxW) return [raw];
        var words=raw.split(/\\s+/), lines=[], cur='';
        words.forEach(function(w){
          var t=cur ? cur+' '+w : w;
          if(ctx.measureText(t).width<=maxW) cur=t;
          else { if(cur) lines.push(cur); cur=w; }
        });
        if(cur) lines.push(cur);
        return lines.length?lines:[raw];
      }
      function wrap(str,maxW,size){
        ctx.font='700 '+size+'px sans-serif';
        var words=String(str||'').split(/\\s+/), lines=[], cur='';
        words.forEach(function(w){
          var t=cur?cur+' '+w:w;
          if(ctx.measureText(t).width<=maxW) cur=t;
          else { if(cur) lines.push(cur); cur=w; }
        });
        if(cur) lines.push(cur);
        return lines.length?lines:[String(str||'')];
      }

      var brand=${JSON.stringify(brand)};
      var cols=${JSON.stringify(colorsArr)};
      var sharer=${JSON.stringify((p.includeDigimon && p.sharerCard) ? p.sharerCard : null)};
      var digPad=5;
      var CTA_Y=1715;

      function digimonShell(x,y,w,h,accent){
        roundRect(x,y,w,h,14);
        ctx.fillStyle='rgba(18,20,28,0.92)'; ctx.fill();
        ctx.strokeStyle=accent||'rgba(200,245,74,0.55)'; ctx.lineWidth=2.5; ctx.stroke();
        roundRect(x+digPad,y+digPad,w-digPad*2,h-digPad*2,10);
        ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=1.2; ctx.stroke();
      }

      // Digimon ÖN YÜZ — sol üst köşe; yazıya göre sıkı w/h, kenarda boşluk yok
      var digFrontH=0;
      if(sharer){
        var fx=16, fy=TOP-8;
        var frontW=198;
        var frontCx=fx+frontW/2;
        var frontMaxW=frontW-digPad*2;
        var dispName=sharer.alias||sharer.name||sharer.username||'';
        var nameFs=16;
        ctx.font='900 '+nameFs+'px sans-serif';
        while(nameFs>11 && ctx.measureText(dispName).width>frontMaxW){
          nameFs-=1; ctx.font='900 '+nameFs+'px sans-serif';
        }
        var eloLines=0;
        if(sharer.isUtr){
          if(sharer.showSinglesLine) eloLines++;
          if(sharer.showDoublesLine) eloLines++;
        } else if(sharer.elo) eloLines=1;
        // içerik yüksekliği: pad + başlık + avatar + isim + spor + elo + pad
        digFrontH=digPad+18+8+52+8+nameFs+4+14+4+(eloLines?eloLines*18:0)+digPad+6;
        digimonShell(fx,fy,frontW,digFrontH,'#C8F54A');
        text(sharer.labels.front||'PLAYER', frontCx, fy+digPad+16, 12, '#C8F54A', 'center', '900');
        var ax=frontCx, ay=fy+digPad+18+8+26, ar=24;
        ctx.beginPath(); ctx.arc(ax,ay,ar,0,Math.PI*2);
        ctx.fillStyle='#1C1F2A'; ctx.fill();
        ctx.strokeStyle='#C8F54A'; ctx.lineWidth=2; ctx.stroke();
        if(avImg){
          ctx.save();
          ctx.beginPath(); ctx.arc(ax,ay,ar-1.5,0,Math.PI*2); ctx.closePath(); ctx.clip();
          var as=Math.max((ar*2)/(avImg.width||1),(ar*2)/(avImg.height||1));
          var aw=(avImg.width||1)*as, ah=(avImg.height||1)*as;
          ctx.drawImage(avImg, ax-aw/2, ay-ah/2, aw, ah);
          ctx.restore();
        } else {
          var ini=(sharer.name||sharer.username||'?').charAt(0).toUpperCase();
          text(ini, ax, ay+8, 20, '#F4F1EA', 'center', '900');
        }
        var tyFront=ay+ar+nameFs+2;
        text(dispName, frontCx, tyFront, nameFs, '#F4F1EA', 'center', '900');
        tyFront+=16;
        text((sharer.emoji||'')+' '+(sharer.sport||''), frontCx, tyFront, 12, '#A8A29A', 'center', '700');
        tyFront+=16;
        if(sharer.isUtr){
          if(sharer.showSinglesLine){
            text((sharer.labels.singles||'Singles')+' '+(sharer.singlesElo||'—'), frontCx, tyFront, 13, '#C8F54A', 'center', '900');
            tyFront+=18;
          }
          if(sharer.showDoublesLine){
            text((sharer.labels.doubles||'Doubles')+' '+(sharer.doublesElo||'—'), frontCx, tyFront, 13, '#C8F54A', 'center', '900');
          }
        } else if(sharer.elo){
          text(sharer.elo, frontCx, tyFront, 14, '#C8F54A', 'center', '900');
        }
      }

      // Uygulama adı — ortada (digimon sol üstte)
      ctx.font='900 82px sans-serif'; ctx.textAlign='left';
      var totalW=0;
      for(var i=0;i<brand.length;i++) totalW+=ctx.measureText(brand[i]).width+3;
      var bx=(W-totalW)/2;
      for(var i=0;i<brand.length;i++){
        ctx.fillStyle=cols[i%cols.length];
        ctx.fillText(brand[i], bx, TOP);
        bx+=ctx.measureText(brand[i]).width+3;
      }

      // Spor dalı — BÜYÜK HARF
      var sportUp=${JSON.stringify(p.sportUpper || String(p.sport || '').toUpperCase())};
      text(sportUp, 540, TOP+48, 42, '#C8F54A', 'center', '900');

      // MAÇ SONUCU — kazanan ismiyle çakışmasın diye yukarı
      var badge=${JSON.stringify(p.resultBadge||'MATCH RESULT')};
      ctx.font='900 22px sans-serif';
      var bw=Math.max(260, ctx.measureText(badge).width+48);
      roundRect((W-bw)/2, TOP+58, bw, 40, 20);
      ctx.fillStyle='#C8F54A'; ctx.fill();
      text(badge, W/2, TOP+85, 22, '#0B0C10', 'center', '900');

      var isUpcoming=${JSON.stringify(!!p.isUpcoming)};
      var isDraw=${JSON.stringify(p.winnerSide==='draw')};
      var tournName=${JSON.stringify(p.tournamentName||'')};
      var tournRound=${JSON.stringify(p.tournamentRound||'')};
      // Rozet ile kazanan arası boşluk
      var ny=Math.max(TOP+118, sharer ? (TOP-8+digFrontH+16) : (TOP+118));
      if(tournName){
        var tLines=nameLines(tournName, 940, 36);
        tLines.forEach(function(ln){ text(ln, 540, ny, 36, '#F4F1EA', 'center', '900'); ny+=42; });
        if(tournRound){ text(tournRound, 540, ny, 24, '#A8A29A', 'center', '800'); ny+=34; }
        ny+=6;
      }

      var name=${JSON.stringify(p.isUpcoming ? '' : (p.resultLabel||''))};
      var won=${JSON.stringify(p.isUpcoming ? (p.wonWord||'VS') : (p.wonWord||'WON'))};
      if(!isUpcoming && name){
        var nLines=nameLines(name, 940, 56);
        nLines.forEach(function(ln){ text(ln, 540, ny, 56, '#F4F1EA', 'center', '900'); ny+=60; });
        // Beraberlikte KAZANDI yazma
        if(!isDraw){
          text(won, 540, ny+4, 48, '#C8F54A', 'center', '900');
          ny+=56;
        } else {
          ny+=10;
        }
      } else if(isUpcoming){
        text(won, 540, ny+4, 48, '#C8F54A', 'center', '900');
        ny+=56;
      }

      // Skor tablosu — alt boşluk yok, sıkı yükseklik (pad L/R=5, bottom=3)
      var pairs=${JSON.stringify(setPairs)};
      var leftRoster=${JSON.stringify(Array.isArray(p.leftRoster) && p.leftRoster.length ? p.leftRoster : [{ name: p.leftLabel || '', elo: p.leftElo || '', rank: p.leftRank || null }])};
      var rightRoster=${JSON.stringify(Array.isArray(p.rightRoster) && p.rightRoster.length ? p.rightRoster : [{ name: p.rightLabel || '', elo: p.rightElo || '', rank: p.rightRank || null }])};
      var leftElo=${JSON.stringify(p.leftElo||'')};
      var rightElo=${JSON.stringify(p.rightElo||'')};
      var scorePadX=5, scorePadBottom=3;
      var scorePanelX=56, scorePanelW=W-112;
      var scoreInnerX=scorePanelX+scorePadX;
      var scoreNameX=scoreInnerX+8;
      function rosterHeight(roster, teamElo){
        var h=8;
        (roster||[]).forEach(function(r){ h+=34; if(r&&r.elo) h+=24; if(r&&r.rank) h+=24; });
        if(!(roster&&roster.length) && teamElo) h+=24;
        return Math.max(72, h);
      }
      var rowH=rosterHeight(leftRoster, leftElo);
      var rowH2=rosterHeight(rightRoster, rightElo);
      var scoreHdrH=36;
      var panelH=scoreHdrH+rowH+6+rowH2+scorePadBottom;
      panel(scorePanelX, ny, scorePanelW, panelH);

      text(${JSON.stringify(p.colPlayer||'PLAYER')}, scoreNameX, ny+26, 18, '#78716C', 'left', '800');
      var setXs=[];
      var showSets=!isUpcoming && pairs.length>0;
      if(showSets){
        for(var s=0;s<Math.max(pairs.length,1);s++){
          var sx=580+s*120;
          setXs.push(sx);
          text('S'+(s+1), sx, ny+26, 18, '#78716C', 'center', '800');
        }
        text(${JSON.stringify(p.colSets||'SETS')}, scorePanelX+scorePanelW-scorePadX-40, ny+26, 18, '#78716C', 'center', '800');
      } else if(isUpcoming){
        text('VS', 780, ny+26, 20, '#78716C', 'center', '800');
      }

      function drawPlayerRow(y, roster, teamElo, scores, setsWon, highlight, h){
        if(highlight){
          roundRect(scoreInnerX, y-28, scorePanelW-scorePadX*2, h, 12);
          ctx.fillStyle='rgba(200,245,74,0.12)'; ctx.fill();
        }
        var ty=y;
        (roster||[]).forEach(function(r){
          var nm=nameLines((r&&r.name)||'', 440, 28);
          nm.forEach(function(ln){ text(ln, scoreNameX, ty, 28, '#F4F1EA', 'left', '900'); ty+=32; });
          if(r&&r.rank){ text('#'+String(r.rank), scoreNameX, ty+1, 20, '#FACC15', 'left', '900'); ty+=22; }
          if(r&&r.elo){ text(r.elo, scoreNameX, ty+1, 20, '#C8F54A', 'left', '800'); ty+=22; }
        });
        if((!roster||!roster.length) && teamElo) text(teamElo, scoreNameX, ty+1, 22, '#C8F54A', 'left', '800');
        var midY=y+Math.min(14, (h/2)-6);
        if(showSets){
          for(var i=0;i<scores.length;i++){
            text(String(scores[i]), setXs[i]||(580+i*120), midY, 34, '#F4F1EA', 'center', '900');
          }
          text(String(setsWon), scorePanelX+scorePanelW-scorePadX-40, midY, 34, '#C8F54A', 'center', '900');
        }
      }

      var L=pairs.map(function(pr){return pr[0];});
      var R=pairs.map(function(pr){return pr[1];});
      var y1=ny+scoreHdrH+24;
      drawPlayerRow(y1, leftRoster, leftElo, L, ${JSON.stringify(p.leftSets)}, ${p.winnerSide==='left'}, rowH);
      var y2=y1+rowH+6;
      drawPlayerRow(y2, rightRoster, rightElo, R, ${JSON.stringify(p.rightSets)}, ${p.winnerSide==='right'}, rowH2);

      ny = ny + panelH + 12;

      // Meta: tarih + saat + süre + zemin aynı satır (gap 5); konum alt satır + (il/ilçe)
      var metaLine=[];
      if(${JSON.stringify(!!p.dateStr)}) metaLine.push(${JSON.stringify(p.dateStr||'')});
      if(${JSON.stringify(!!p.timeStr)}) metaLine.push(${JSON.stringify(p.timeStr||'')});
      if(${JSON.stringify(!!p.durationLabel)}) metaLine.push(${JSON.stringify(p.durationLabel||'')});
      if(${JSON.stringify(!!p.surface)}) metaLine.push(${JSON.stringify(p.surface||'')});
      var placeName=${JSON.stringify(p.placeName||'')};
      var placeRegion=${JSON.stringify(p.placeRegion||'')};
      var hasMeta=metaLine.length>0 || placeName || placeRegion || ${JSON.stringify(!!p.place)};
      if(hasMeta){
        var metaH=48;
        if(placeName || placeRegion || ${JSON.stringify(!!p.place)}) metaH+=32;
        panel(56, ny, W-112, metaH);
        var metaGap=5;
        var metaFs=24;
        ctx.font='700 '+metaFs+'px sans-serif';
        var metaTotal=0;
        metaLine.forEach(function(m,idx){
          metaTotal+=ctx.measureText(m).width;
          if(idx) metaTotal+=metaGap;
        });
        var mx=(W-metaTotal)/2;
        var my=ny+30;
        metaLine.forEach(function(m){
          text(m, mx, my, metaFs, '#E7E5E4', 'left', '700');
          mx+=ctx.measureText(m).width+metaGap;
        });
        var locLine='';
        if(placeName) locLine=placeName;
        else if(${JSON.stringify(!!p.place)} && !placeRegion) locLine=${JSON.stringify(p.place||'')};
        if(placeRegion) locLine=locLine ? (locLine+' '+placeRegion) : placeRegion;
        if(locLine){
          text(locLine, 540, my+(metaLine.length?30:0), 22, '#E7E5E4', 'center', '700');
        }
        ny += metaH + 12;
      }

      // Digimon ARKA YÜZ — skor/meta altında (ön yüz zaten sol üstte)
      if(sharer){
        var hasRanks=!!sharer.showRanks;
        var isUtrRank=!!sharer.isUtr && hasRanks;
        var backH=hasRanks?(isUtrRank?260:240):200;
        var backW=W-112;
        var digTop=ny;
        var bx2=56;
        digimonShell(bx2,digTop,backW,backH,'#A855F7');
        text(sharer.labels.back||'STATS', bx2+backW/2, digTop+digPad+16, 13, '#C084FC', 'center', '900');
        var digTiles=[
          { label:sharer.labels.matches||'Matches', value:String(sharer.totalMatches||0), color:'#38BDF8' },
          { label:sharer.labels.wins||'Wins', value:String(sharer.wins||0), color:'#4ADE80' },
          { label:sharer.labels.losses||'Losses', value:String(sharer.losses||0), color:'#F87171' },
        ];
        var digCols=3;
        var digGap=6;
        var digTw=(backW-digPad*2-(digCols-1)*digGap)/digCols;
        var digTh=56;
        digTiles.forEach(function(tile,i){
          var tx=bx2+digPad+i*(digTw+digGap);
          var ty=digTop+digPad+28;
          roundRect(tx,ty,digTw,digTh,8);
          ctx.fillStyle='rgba(255,255,255,0.05)'; ctx.fill();
          text(tile.value, tx+digTw/2, ty+26, 24, tile.color, 'center', '900');
          text(tile.label, tx+digTw/2, ty+digTh-10, 12, '#A8A29A', 'center', '700');
        });
        var afterStatsY=digTop+digPad+28+digTh+8;
        if((sharer.titles||0)>0){
          roundRect(bx2+digPad, afterStatsY, backW-digPad*2, 26, 8);
          ctx.fillStyle='rgba(250,204,21,0.12)'; ctx.fill();
          text('🏆 '+(sharer.labels.titles||'Titles')+'  '+String(sharer.titles), bx2+backW/2, afterStatsY+18, 14, '#FACC15', 'center', '800');
          afterStatsY+=32;
        }
        if(hasRanks){
          var sShort=sharer.labels.singlesShort||'S';
          var dShort=sharer.labels.doublesShort||'D';
          var colS=bx2+backW-digPad-(isUtrRank?110:60);
          var colD=bx2+backW-digPad;
          if(isUtrRank){
            text(sShort, colS, afterStatsY+12, 13, '#C8F54A', 'right', '900');
            text(dShort, colD, afterStatsY+12, 13, '#C084FC', 'right', '900');
            afterStatsY+=20;
          }
          var rankRows=[
            { lbl:sharer.labels.rankLocal||'📍 Local', s:sharer.rankLocalS||'—', d:sharer.rankLocalD||'—' },
            { lbl:sharer.labels.rankNational||'🇹🇷 National', s:sharer.rankNationalS||'—', d:sharer.rankNationalD||'—' },
            { lbl:sharer.labels.rankIntl||'🌍 International', s:sharer.rankInternationalS||'—', d:sharer.rankInternationalD||'—' },
          ];
          rankRows.forEach(function(r,i){
            var ry=afterStatsY+16+i*24;
            text(r.lbl, bx2+digPad, ry, 14, '#A8A29A', 'left', '700');
            text(r.s, colS, ry, 15, '#FACC15', 'right', '900');
            if(isUtrRank) text(r.d, colD, ry, 15, '#FACC15', 'right', '900');
          });
        }
        ny = digTop + backH + 12;
      }

      // Turnuva skor paylaşımı: Digimon (veya meta) altında küçültülmüş puan tablosu
      var standingsTable=${JSON.stringify(p.standingsTable || null)};
      var hasStandings=!!(standingsTable && standingsTable.rows && standingsTable.rows.length);
      if(hasStandings){
        var stRowCount=Math.min(standingsTable.rows.length, 10);
        var stRowH=stRowCount>8?22:24;
        var stTitleH=28;
        var stHdrH=22;
        var stBoxH=18 + stTitleH + stHdrH + stRowCount*stRowH + 14;
        var stTop=ny;
        if(stTop + stBoxH > CTA_Y - 24){
          stBoxH=Math.max(80, CTA_Y - 24 - stTop);
          stRowCount=Math.max(3, Math.floor((stBoxH - 18 - stTitleH - stHdrH - 14)/stRowH));
          stBoxH=18 + stTitleH + stHdrH + stRowCount*stRowH + 14;
        }
        roundRect(56, stTop, W-112, stBoxH, 16);
        ctx.fillStyle='rgba(15,23,42,0.90)'; ctx.fill();
        ctx.strokeStyle='rgba(200,245,74,0.40)'; ctx.lineWidth=2; ctx.stroke();
        var hdr=standingsTable.headers||{};
        // Dar sütunlar — kartın altındaki kompakt tablo
        var colX=[72, 108, 560, 640, 720, 800, 880, 960];
        var sy=stTop+24;
        text(standingsTable.title||'', 540, sy, 20, '#C8F54A', 'center', '900');
        sy+=stTitleH-4;
        text('#', colX[0], sy, 16, '#94A3B8', 'center', '800');
        text(hdr.player||'', colX[1]+4, sy, 16, '#94A3B8', 'left', '800');
        text(hdr.played||'P', colX[2], sy, 16, '#94A3B8', 'center', '800');
        text(hdr.won||'W', colX[3], sy, 16, '#94A3B8', 'center', '800');
        text(hdr.drawn||'D', colX[4], sy, 16, '#94A3B8', 'center', '800');
        text(hdr.lost||'L', colX[5], sy, 16, '#94A3B8', 'center', '800');
        text(hdr.avg||'Av', colX[6], sy, 16, '#94A3B8', 'center', '800');
        text(hdr.pts||'P', colX[7], sy, 16, '#4ade80', 'center', '800');
        sy+=8;
        ctx.strokeStyle='rgba(148,163,184,0.30)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(72, sy); ctx.lineTo(W-72, sy); ctx.stroke();
        sy+=stRowH-6;
        var nameMaxW=colX[2]-colX[1]-16;
        for(var ri=0; ri<stRowCount; ri++){
          var row=standingsTable.rows[ri];
          if(!row) continue;
          var rowFs=15;
          text(String(row.rank), colX[0], sy, rowFs, '#F4F1EA', 'center', '800');
          ctx.font='700 '+rowFs+'px sans-serif';
          var nm=String(row.name||'');
          while(nm.length>3 && ctx.measureText(nm).width>nameMaxW) nm=nm.slice(0,-1);
          if(nm!==String(row.name||'') && nm.length) nm=nm.slice(0,-1)+'…';
          text(nm, colX[1]+4, sy, rowFs, '#F4F1EA', 'left', '700');
          text(String(row.played), colX[2], sy, rowFs, '#E7E5E4', 'center', '700');
          text(String(row.won), colX[3], sy, rowFs, '#E7E5E4', 'center', '700');
          text(String(row.drawn), colX[4], sy, rowFs, '#E7E5E4', 'center', '700');
          text(String(row.lost), colX[5], sy, rowFs, '#E7E5E4', 'center', '700');
          text(String(row.avg), colX[6], sy, rowFs, '#E7E5E4', 'center', '700');
          text(String(row.points), colX[7], sy, rowFs, '#4ade80', 'center', '900');
          sy+=stRowH;
        }
        if(standingsTable.rows.length>stRowCount){
          text('… +'+(standingsTable.rows.length-stRowCount), 540, Math.min(sy-2, stTop+stBoxH-10), 14, '#94A3B8', 'center', '700');
        }
        ny = stTop + stBoxH + 14;
      }

      // Canlı takip istatistik panelleri — digimon / puan tablosu ile CTA arasında kalan alana sığdır
      var panels=${JSON.stringify((stats && stats.panels) || [])};
      var roomForStats = CTA_Y - 36 - ny;
      var maxPanels = panels.length > 4 ? 4 : panels.length;
      if(hasStandings) maxPanels = Math.min(maxPanels, 2);
      if(roomForStats < 140) maxPanels = 0;
      else if(roomForStats < 280) maxPanels = Math.min(maxPanels, 2);
      var colW = (W-112-20)/2;
      var px = 56, py = ny;
      var rowMaxH = 0;
      for(var pi=0; pi<maxPanels; pi++){
        var pn=panels[pi];
        var tiles=pn.tiles||[];
        var th = 48 + tiles.length*46 + 16;
        if(pi%2===0){ px=56; if(pi>0) py += rowMaxH + 16; rowMaxH=0; }
        else { px=56+colW+20; }
        if(py+th > CTA_Y-36) break;
        panel(px, py, colW, th);
        text(pn.title||'', px+20, py+36, 24, pn.accent||'#C8F54A', 'left', '900');
        var ty2=py+74;
        tiles.forEach(function(tile){
          text(tile.label||'', px+20, ty2, 20, '#A8A29A', 'left', '700');
          text(tile.value||'', px+colW-20, ty2, 28, '#F4F1EA', 'right', '900');
          ty2+=48;
        });
        rowMaxH=Math.max(rowMaxH, th);
      }
      if(maxPanels>0) ny = py + rowMaxH + 24;

      // Highlights — sadece sığarsa
      var highs=${JSON.stringify((stats && stats.highlights) || [])};
      if(highs.length && ny+50 < CTA_Y-36){
        var hx=56;
        highs.forEach(function(h){
          ctx.font='800 20px sans-serif';
          var tw=ctx.measureText(h).width+36;
          roundRect(hx, ny, tw, 40, 20);
          ctx.fillStyle='rgba(200,245,74,0.18)'; ctx.fill();
          ctx.strokeStyle='rgba(200,245,74,0.45)'; ctx.lineWidth=2; ctx.stroke();
          text(h, hx+tw/2, ny+27, 20, '#C8F54A', 'center', '800');
          hx+=tw+12;
        });
        ny+=56;
      }

      var src=${JSON.stringify((stats && stats.workoutSource) || '')};
      if(src) text(src, 540, 1688, 22, '#A8A29A', 'center', '700');

      roundRect(180, CTA_Y, 720, 92, 46);
      ctx.fillStyle='#C8F54A'; ctx.fill();
      text(${JSON.stringify(p.ctaLabel||'AcTiViTy · Download')}, 540, 1776, 30, '#0B0C10', 'center', '900');

      if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(canvas.toDataURL('image/png'));
    }catch(e){
      if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage('ERR:'+String(e&&e.message||e));
    }
  }

  function withAvatar(bgImg){
    var avData=${JSON.stringify(avatarDataUrl||'')};
    if(avData){
      var av=new Image();
      av.onload=function(){ go(bgImg, av); };
      av.onerror=function(){ go(bgImg, null); };
      av.src=avData;
    } else {
      go(bgImg, null);
    }
  }

  var bgData=${JSON.stringify(bgDataUrl||'')};
  if(bgData){
    var img=new Image();
    img.onload=function(){ withAvatar(img); };
    img.onerror=function(){ withAvatar(null); };
    img.src=bgData;
  } else {
    setTimeout(function(){ withAvatar(null); }, 60);
  }
})();
</script></body></html>`;
}

export default function MatchResultShareModal({
    visible,
    match,
    onClose,
    tournament = null,
    standings = null,
}) {
    const t = useT();
    const lang = useSelector(s => s.lang?.lang) || 'tr';
    const myUser = useSelector(s => s.auth?.user);
    const insets = useSafeAreaInsets();
    const [tournamentWins, setTournamentWins] = useState(0);
    const [ranks, setRanks] = useState({
        singles: { local: null, national: null, international: null },
        doubles: { local: null, national: null, international: null },
    });
    const [includeDigimon, setIncludeDigimon] = useState(false);
    const [avatarDataUrl, setAvatarDataUrl] = useState(null);
    const shareMatch = useMemo(() => {
        if (!match) return null;
        if (tournament) return tournamentMatchToShareMatch(tournament, match) || match;
        return match;
    }, [match, tournament]);
    const payload = useMemo(() => {
        if (!visible || !match) return null;
        const base = tournament
            ? buildTournamentMatchSharePayload(tournament, match, standings, t, lang)
            : buildMatchSharePayload(match, t, lang);
        if (!base) return null;
        const sub = shareMatch?.subCategory || match.subCategory || tournament?.subCategory;
        const sharerCard = buildSharerDigimonPayload(myUser, sub, tournamentWins, t, lang, ranks);
        const isTourn = !!base.isTournament;
        const isUpcoming = !!base.isUpcoming;
        return {
            ...base,
            sharerCard,
            includeDigimon,
            ctaLabel: t.shareMatchStoreCta || 'AcTiViTy · Uygulamayı indir',
            wonWord: isUpcoming
                ? (t.shareTournMatchVsWord || 'VS')
                : (t.shareMatchWonWord || (lang === 'tr' ? 'KAZANDI' : lang === 'ru' ? 'ПОБЕДИЛ' : lang === 'de' ? 'GEWINNT' : 'WON')),
            resultBadge: isTourn
                ? (isUpcoming
                    ? (t.shareTournMatchUpcomingBadge
                        || (lang === 'tr' ? 'YAKLAŞAN MAÇ' : lang === 'ru' ? 'ПРЕДСТОЯЩИЙ' : lang === 'de' ? 'NÄCHSTES SPIEL' : 'UPCOMING'))
                    : (t.shareTournMatchResultBadge
                        || (lang === 'tr' ? 'TURNUVA SONUCU' : lang === 'ru' ? 'ТУРНИР' : lang === 'de' ? 'TURNIER' : 'TOURNAMENT')))
                : (t.shareMatchResultBadge || (lang === 'tr' ? 'MAÇ SONUCU' : lang === 'ru' ? 'РЕЗУЛЬТАТ' : lang === 'de' ? 'ERGEBNIS' : 'MATCH RESULT')),
            colPlayer: t.shareMatchColPlayer || (lang === 'tr' ? 'OYUNCU' : lang === 'ru' ? 'ИГРОК' : lang === 'de' ? 'SPIELER' : 'PLAYER'),
            colSets: t.shareMatchColSets || 'SETS',
        };
    }, [visible, match, tournament, standings, shareMatch, t, lang, myUser, tournamentWins, ranks, includeDigimon]);
    const [busy, setBusy] = useState(false);
    const [needCapture, setNeedCapture] = useState(false);
    const [captureHtml, setCaptureHtml] = useState(null);
    const pendingAction = useRef(null);
    const bgDataRef = useRef(null);
    const avatarDataRef = useRef(null);

    useEffect(() => {
        if (!visible) {
            setNeedCapture(false);
            setCaptureHtml(null);
            setBusy(false);
            pendingAction.current = null;
            bgDataRef.current = null;
            avatarDataRef.current = null;
            setAvatarDataUrl(null);
            setTournamentWins(0);
            setRanks({
                singles: { local: null, national: null, international: null },
                doubles: { local: null, national: null, international: null },
            });
            setIncludeDigimon(false);
        }
    }, [visible]);

    // Şampiyonluk + yerel/ulusal/uluslararası sıralama — UTR'de tekli ve çiftler ayrı
    useEffect(() => {
        const subCat = shareMatch?.subCategory || match?.subCategory || tournament?.subCategory;
        if (!visible || !myUser?.id || !subCat) {
            setTournamentWins(0);
            setRanks({
                singles: { local: null, national: null, international: null },
                doubles: { local: null, national: null, international: null },
            });
            return undefined;
        }
        let cancelled = false;
        const sub = subCat;
        const isUtr = UTR_SHARE_SUBS.has(sub);
        const scopes = ['local', 'national', 'international'];
        const fetchScope = (scope, ratingType) =>
            api.get('/interests/leaderboard', {
                params: { subCategory: sub, scope, ...(ratingType ? { ratingType } : {}) },
            }).catch(() => ({ data: null }));

        (async () => {
            try {
                const achP = api.get(`/achievements/${myUser.id}`).catch(() => ({ data: null }));
                const singlesPs = scopes.map((sc) => fetchScope(sc, isUtr ? 'singles' : undefined));
                const doublesPs = isUtr
                    ? scopes.map((sc) => fetchScope(sc, 'doubles'))
                    : [Promise.resolve({ data: null }), Promise.resolve({ data: null }), Promise.resolve({ data: null })];
                const [achRes, ...rest] = await Promise.all([achP, ...singlesPs, ...doublesPs]);
                if (cancelled) return;
                const list = Array.isArray(achRes?.data?.tournament) ? achRes.data.tournament : [];
                setTournamentWins(list.filter(
                    (a) => a?.subCategory === sub && Number(a?.placement) === 1,
                ).length);
                const sRes = rest.slice(0, 3);
                const dRes = rest.slice(3, 6);
                setRanks({
                    singles: {
                        local: sRes[0]?.data?.myRank ?? null,
                        national: sRes[1]?.data?.myRank ?? null,
                        international: sRes[2]?.data?.myRank ?? null,
                    },
                    doubles: {
                        local: dRes[0]?.data?.myRank ?? null,
                        national: dRes[1]?.data?.myRank ?? null,
                        international: dRes[2]?.data?.myRank ?? null,
                    },
                });
            } catch {
                if (!cancelled) {
                    setTournamentWins(0);
                    setRanks({
                        singles: { local: null, national: null, international: null },
                        doubles: { local: null, national: null, international: null },
                    });
                }
            }
        })();
        return () => { cancelled = true; };
    }, [visible, myUser?.id, shareMatch?.subCategory, match?.subCategory, tournament?.subCategory]);

    // Zemin/spor arka planı + avatar önceden yükle
    useEffect(() => {
        if (!visible || !payload) {
            bgDataRef.current = null;
            avatarDataRef.current = null;
            return undefined;
        }
        let cancelled = false;
        (async () => {
            const [bg, av] = await Promise.all([
                shareBackgroundToDataUrl(payload.subCategory, payload.surfaceRaw),
                avatarToDataUrl(payload.sharerCard?.avatarUrl),
            ]);
            if (cancelled) return;
            bgDataRef.current = bg;
            avatarDataRef.current = av;
            setAvatarDataUrl(av);
        })();
        return () => { cancelled = true; };
    }, [visible, payload?.id, payload?.subCategory, payload?.surfaceRaw, payload?.sharerCard?.avatarUrl]);

    const onPng = async (dataUrl) => {
        setNeedCapture(false);
        setCaptureHtml(null);
        if (!dataUrl || dataUrl.startsWith('ERR:')) {
            setBusy(false);
            Alert.alert(t.error, t.shareMatchFail);
            return;
        }
        const action = pendingAction.current;
        pendingAction.current = null;
        try {
            const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
            const path = `${FileSystem.cacheDirectory}activity-match-${payload.id}.png`;
            await FileSystem.writeAsStringAsync(path, b64, { encoding: FileSystem.EncodingType.Base64 });
            const message = payload.isTournament
                ? tournamentMatchShareMessage(payload, t)
                : matchShareMessage(payload, t);

            if (action === 'save') {
                const ok = await ensureGallerySave(path);
                if (!ok) Alert.alert(t.error, t.shareMatchGalleryDenied);
                else Alert.alert('', t.shareMatchSaved);
                return;
            }
            if (action === 'whatsapp') {
                await shareToWhatsApp({ filePath: path, message });
                onClose?.();
                return;
            }
            if (action === 'wa_status') {
                onClose?.();
                await new Promise((r) => setTimeout(r, 350));
                await shareToWhatsAppStatus({ filePath: path, message: '', t });
                return;
            }
            if (action === 'ig_story') {
                onClose?.();
                await new Promise((r) => setTimeout(r, 350));
                await shareToInstagramStory({
                    filePath: path,
                    t,
                    linkUrl: payload.url || PLAY_STORE_URL,
                });
                return;
            }
            await shareViaSystemSheet({ filePath: path, message });
            onClose?.();
        } catch {
            Alert.alert(t.error, t.shareMatchFail);
        } finally {
            setBusy(false);
        }
    };

    const start = async (action) => {
        if (!payload || busy) return;
        pendingAction.current = action;
        setBusy(true);
        try {
            if (!bgDataRef.current) {
                bgDataRef.current = await shareBackgroundToDataUrl(payload.subCategory, payload.surfaceRaw);
            }
            if (!avatarDataRef.current && payload.sharerCard?.avatarUrl) {
                avatarDataRef.current = await avatarToDataUrl(payload.sharerCard.avatarUrl);
            }
            setCaptureHtml(cardHtml(payload, bgDataRef.current, avatarDataRef.current || avatarDataUrl));
            setNeedCapture(true);
        } catch {
            setBusy(false);
            Alert.alert(t.error, t.shareMatchFail);
        }
    };

    const targets = [
        { id: 'whatsapp', emoji: '💬', label: 'WhatsApp' },
        { id: 'wa_status', emoji: '🟢', label: t.shareMatchWaStatus || 'WhatsApp Status' },
        { id: 'ig_story', emoji: '📱', label: t.shareMatchIgStory || 'Instagram Story' },
        { id: 'save', emoji: '📥', label: t.shareMatchSaveBtn || 'Save to gallery' },
        { id: 'more', emoji: '⋯', label: t.shareMatchMore || 'More apps' },
    ];

    if (!payload) {
        return (
            <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
                <View style={s.overlay} />
            </Modal>
        );
    }

    const previewStats = payload.shareStats;

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={[s.overlay, { paddingBottom: Math.max(insets.bottom, 10) }]}>
                <TouchableOpacity style={s.backdropTap} activeOpacity={1} onPress={onClose} />
                <View style={s.sheet}>
                    <View style={s.handle} />
                    <View style={s.header}>
                        <Text style={s.title}>
                            {payload.isTournament
                                ? (payload.isUpcoming
                                    ? (t.shareTournMatchTitleUpcoming || t.shareMatchTitle)
                                    : (t.shareTournMatchTitle || t.shareMatchTitle))
                                : t.shareMatchTitle}
                        </Text>
                        <TouchableOpacity onPress={onClose} hitSlop={12}><Text style={s.close}>✕</Text></TouchableOpacity>
                    </View>

                    <View style={s.preview}>
                        <View style={s.brandRow}>
                            {(payload.brand || 'AcTiViTy').split('').map((ch, i) => (
                                <Text key={i} style={{ color: BRAND_LETTER_COLORS[i % BRAND_LETTER_COLORS.length], fontWeight: '900', fontSize: 16 }}>
                                    {ch}
                                </Text>
                            ))}
                        </View>
                        <Text style={s.sport}>{payload.emoji} {payload.sport}{payload.surface ? ` · ${payload.surface}` : ''}</Text>
                        {!!payload.tournamentName && (
                            <Text style={[s.metaLine, { color: '#F4F1EA', fontWeight: '800', marginTop: 2 }]} numberOfLines={2}>
                                {payload.tournamentName}
                            </Text>
                        )}
                        {!!payload.tournamentRound && (
                            <Text style={s.metaLine}>{payload.tournamentRound}</Text>
                        )}
                        {payload.isUpcoming ? (
                            <Text style={s.winnerLine} numberOfLines={1}>
                                <Text style={{ color: '#C8F54A' }}>{payload.wonWord}</Text>
                            </Text>
                        ) : (
                            <Text style={s.winnerLine} numberOfLines={1}>
                                <Text style={{ color: '#F4F1EA' }}>{payload.resultLabel} </Text>
                                <Text style={{ color: '#C8F54A' }}>{payload.wonWord}</Text>
                            </Text>
                        )}
                        <View style={s.vsRow}>
                            <View style={{ flex: 1 }}>
                                {(payload.leftRoster?.length ? payload.leftRoster : [{ name: payload.leftLabel, elo: payload.leftElo, rank: payload.leftRank }]).map((r, i) => (
                                    <View key={`L${i}`} style={{ marginBottom: 2 }}>
                                        <Text style={s.side} numberOfLines={1}>{r.name}</Text>
                                        {r.rank != null ? <Text style={[s.elo, { color: '#FACC15' }]}>#{r.rank}</Text> : null}
                                        {!!r.elo && <Text style={s.elo}>{r.elo}</Text>}
                                    </View>
                                ))}
                            </View>
                            <Text style={s.score}>
                                {payload.isUpcoming ? 'vs' : `${payload.leftSets}–${payload.rightSets}`}
                            </Text>
                            <View style={{ flex: 1 }}>
                                {(payload.rightRoster?.length ? payload.rightRoster : [{ name: payload.rightLabel, elo: payload.rightElo, rank: payload.rightRank }]).map((r, i) => (
                                    <View key={`R${i}`} style={{ marginBottom: 2 }}>
                                        <Text style={[s.side, { textAlign: 'right' }]} numberOfLines={1}>{r.name}</Text>
                                        {r.rank != null ? <Text style={[s.elo, { textAlign: 'right', color: '#FACC15' }]}>#{r.rank}</Text> : null}
                                        {!!r.elo && <Text style={[s.elo, { textAlign: 'right' }]}>{r.elo}</Text>}
                                    </View>
                                ))}
                            </View>
                        </View>
                        {!!payload.dateStr && (
                            <Text style={s.metaLine}>📅 {payload.dateStr}</Text>
                        )}
                        {!!payload.place && (
                            <Text style={s.metaLine}>📍 {payload.place}</Text>
                        )}
                        {!!payload.durationLabel && (
                            <Text style={s.metaLine}>⏱ {payload.durationLabel}</Text>
                        )}
                        {previewStats?.hasWorkout && (
                            <Text style={s.metaLine}>♥ {t.statWorkout}{previewStats.workoutSource ? ` · ${previewStats.workoutSource}` : ''}</Text>
                        )}
                    </View>

                    {/* Digimon kartı isteğe bağlı — kapalıysa skor kartına çizilmez */}
                    {!!payload.sharerCard && (
                        <TouchableOpacity
                            style={[s.digimonToggle, includeDigimon && s.digimonToggleOn]}
                            activeOpacity={0.8}
                            onPress={() => setIncludeDigimon((v) => !v)}
                            disabled={busy}
                        >
                            <View style={[s.digimonCheckBox, includeDigimon && s.digimonCheckBoxOn]}>
                                {includeDigimon ? <Text style={s.digimonCheckMark}>✓</Text> : null}
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.digimonToggleTitle}>
                                    {t.shareMatchDigimonToggle || 'Digimon kartımı da ekle'}
                                </Text>
                                <Text style={s.digimonToggleHint}>
                                    {t.shareMatchDigimonToggleHint || 'ELO, maç/G/M ve sıralama önlü-arka kartta görünür'}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    )}

                    {busy ? (
                        <ActivityIndicator color="#C8F54A" style={{ marginVertical: 28 }} />
                    ) : (
                        <ScrollView
                            style={s.list}
                            contentContainerStyle={{ paddingBottom: 8 }}
                            showsVerticalScrollIndicator
                            bounces={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            {targets.map((it) => (
                                <TouchableOpacity
                                    key={it.id}
                                    style={s.row}
                                    activeOpacity={0.75}
                                    onPress={() => start(it.id)}
                                >
                                    <Text style={s.emoji}>{it.emoji}</Text>
                                    <Text style={s.rowLabel}>{it.label}</Text>
                                    <Text style={s.chev}>›</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}
                </View>
            </View>
            {needCapture && captureHtml && (
                <View style={s.hidden} pointerEvents="none">
                    <WebView
                        originWhitelist={['*']}
                        source={{ html: captureHtml }}
                        onMessage={(e) => onPng(e.nativeEvent?.data)}
                        javaScriptEnabled
                        style={{ width: 1, height: 1, opacity: 0 }}
                    />
                </View>
            )}
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: '#000000cc', justifyContent: 'flex-end' },
    backdropTap: { flex: 1 },
    sheet: {
        backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, maxHeight: '78%',
    },
    handle: {
        alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
        backgroundColor: '#ffffff33', marginBottom: 10,
    },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    title: { color: '#fff', fontSize: 17, fontWeight: '900', flex: 1 },
    close: { color: colors.textMuted, fontSize: 22 },
    preview: {
        borderRadius: 14, overflow: 'hidden', marginBottom: 12, paddingVertical: 12, paddingHorizontal: 14,
        backgroundColor: '#0B0C10', borderWidth: 1, borderColor: '#2A2D36',
    },
    brandRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 4 },
    sport: { color: '#C8F54A', fontSize: 12, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
    winnerLine: { textAlign: 'center', fontSize: 15, fontWeight: '900', marginBottom: 10 },
    vsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    side: { color: '#F4F1EA', fontSize: 12, fontWeight: '800', textAlign: 'center' },
    elo: { color: '#C8F54A', fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 2 },
    score: { color: '#C8F54A', fontSize: 22, fontWeight: '900', minWidth: 56, textAlign: 'center' },
    metaLine: { color: '#A8A29A', fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 8 },
    digimonToggle: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#16181F', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14,
        marginBottom: 12, borderWidth: 1, borderColor: '#2A2D36',
    },
    digimonToggleOn: { borderColor: '#C8F54A66', backgroundColor: '#C8F54A12' },
    digimonCheckBox: {
        width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: '#78716C',
        alignItems: 'center', justifyContent: 'center',
    },
    digimonCheckBoxOn: { borderColor: '#C8F54A', backgroundColor: '#C8F54A' },
    digimonCheckMark: { color: '#0B0C10', fontSize: 14, fontWeight: '900', lineHeight: 16 },
    digimonToggleTitle: { color: '#F4F1EA', fontSize: 14, fontWeight: '800' },
    digimonToggleHint: { color: '#A8A29A', fontSize: 11, fontWeight: '600', marginTop: 2 },
    list: { flexGrow: 0 },
    row: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: colors.surface2 || '#222',
        borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14,
        marginBottom: 8, borderWidth: 1, borderColor: colors.border || '#333',
    },
    emoji: { fontSize: 22, width: 28, textAlign: 'center' },
    rowLabel: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1 },
    chev: { color: colors.textMuted, fontSize: 22, fontWeight: '600' },
    hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -20, top: -20 },
});
