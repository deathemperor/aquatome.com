#!/usr/bin/env python3
"""The app's icons a reader can choose (Tài khoản → Biểu tượng ứng dụng), drawn here and rendered into the asset catalog.

Usage: apps/ios/scripts/app-icons.py. Needs rsvg-convert (Homebrew librsvg). Writes AquaTome/Assets.xcassets/
AppIcon-<id>.appiconset for each icon in ICONS: explicit home-screen sizes only (SLOTS), for an iPhone and an iPad, no
1024 (only the primary icon needs one); a 1024 would cost about 430 kB an icon. The primary icon,
AppIcon (the AT), isn't drawn here. AppIcons.swift lists the same ids with their names; AppIconFlowTests checks that
each is in the app.

Each fish is a white character on a bright gradient: a palette (P) and a character (CHAR), some with a seasonal extra.
The earlier designs (AT under water, book and water, leaf-fish) are the owner's first round, kept as choices.
"""
import json, math, os, random, subprocess, sys, tempfile
P = {  # a: top-left, b: glow top-right, c: glow bottom-left, d: bottom-right, x: the fish's accent
 'pink':    ('#FF4FA3','#FF8A3D','#6E5BFF','#B44CFF','#FF4FA3'),
 'aqua':    ('#1FD1C1','#7CF0B0','#3B6BFF','#6E5BFF','#21B8E0'),
 'sunrise': ('#FF8A3D','#FFD25A','#FF4FA3','#8E4DFF','#FF7A3D'),
 'lagoon':  ('#00C6FF','#9BF6FF','#0072FF','#3A2BFF','#0090FF'),
 'mint':    ('#2EDB9A','#D4FC79','#0FA3A0','#167F8C','#18B58E'),
 'grape':   ('#8E2DE2','#FF6FD8','#4A00E0','#2B1B8A','#B33DFF'),
 'peach':   ('#FF8FA3','#FFE29F','#FF6A88','#E8457A','#FF6A88'),
 'night':   ('#28307A','#3FC8FF','#0B1036','#3F2B96','#3FC8FF'),
 'lime':    ('#7EE27A','#FFF07C','#25C2A0','#1E8E8F','#2DB86A'),
 'reef':    ('#FF5F6D','#FFC371','#FF3CAC','#784BA0','#FF5F6D'),
 'sky':     ('#6FD6FF','#C9F3FF','#7F7FD5','#5B6CF0','#4D8CFF'),
 'ember':   ('#E8202A','#FFC83D','#B3122E','#7A0A1E','#E8202A'),
}
INK = '#1B1340'

def defs(p, u):
    a, b, c, d, x = P[p]
    return f'''<defs>
<linearGradient id="g{u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{d}"/></linearGradient>
<radialGradient id="r1{u}" cx=".95" cy=".05" r=".75"><stop offset="0" stop-color="{b}"/><stop offset="1" stop-color="{b}" stop-opacity="0"/></radialGradient>
<radialGradient id="r2{u}" cx=".1" cy="1" r=".8"><stop offset="0" stop-color="{c}"/><stop offset="1" stop-color="{c}" stop-opacity="0"/></radialGradient>
<linearGradient id="body{u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E6DEFF"/></linearGradient>
<linearGradient id="fin{u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6F2FF"/><stop offset="1" stop-color="#D6CCFF"/></linearGradient>
<linearGradient id="acc{u}" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="{x}"/></linearGradient>
<filter id="sh{u}" x="-25%" y="-25%" width="150%" height="160%"><feDropShadow dx="0" dy="22" stdDeviation="26" flood-color="#1A0B45" flood-opacity=".35"/></filter>
</defs>
<rect width="1024" height="1024" fill="url(#g{u})"/><rect width="1024" height="1024" fill="url(#r1{u})"/><rect width="1024" height="1024" fill="url(#r2{u})"/>'''

def eye(x, y, s=1.0):
    return f'<ellipse cx="{x}" cy="{y}" rx="{36*s:.0f}" ry="{46*s:.0f}" fill="{INK}"/><circle cx="{x+12*s:.0f}" cy="{y-18*s:.0f}" r="{13*s:.0f}" fill="#fff"/>'
def smile(x, y, w=70):
    return f'<path d="M{x},{y} C{x+w*.28:.0f},{y+24} {x+w*.76:.0f},{y+22} {x+w},{y-4}" stroke="{INK}" stroke-width="16" fill="none" stroke-linecap="round"/>'
def blush(x, y):
    return f'<ellipse cx="{x}" cy="{y}" rx="34" ry="20" fill="#FF7FB0" opacity=".45"/>'
def bubbles(op=1):
    return f'<circle cx="860" cy="280" r="26" fill="#fff" opacity="{.55*op}"/><circle cx="902" cy="214" r="16" fill="#fff" opacity="{.45*op}"/>'

def clip_body(u, body, inner):
    return f'<clipPath id="cb{u}"><path d="{body}"/></clipPath><g clip-path="url(#cb{u})">{inner}</g>'

# ---- characters: each returns (silhouette, face) drawn about a 1024 canvas
def bubs(u, x):
    tail='M392,520 C344,452 290,372 222,356 C184,348 164,378 174,418 C186,466 214,498 250,522 C214,546 186,578 174,626 C164,666 184,696 222,688 C290,672 344,588 392,520 Z'
    dors='M452,392 C444,320 470,236 520,214 C546,204 562,226 556,256 C580,220 622,212 640,236 C654,256 646,280 630,298 C664,290 694,306 698,334 C700,350 690,360 680,366 Z'
    body='M352,520 C380,404 500,338 624,340 C744,342 830,420 830,528 C830,640 738,708 618,710 C494,712 380,640 352,520 Z'
    pect='M628,612 C600,600 556,616 530,652 C516,672 524,690 548,688 C584,684 618,662 634,636 C640,626 638,616 628,612 Z'
    sil=f'<path d="{tail}" fill="url(#fin{u})"/><path d="{dors}" fill="url(#fin{u})"/><path d="{body}" fill="url(#body{u})"/><path d="{pect}" fill="url(#fin{u})"/>'
    face=eye(716,482)+smile(742,580)+blush(660,566)
    return sil, face

def betta(u, x):
    tail='M420,500 C360,380 240,300 150,340 C96,366 116,430 168,462 C108,470 70,530 112,572 C70,620 110,700 182,692 C110,736 160,820 240,790 C330,760 400,650 430,560 Z'
    dors='M470,430 C450,330 500,230 590,214 C650,204 664,250 630,276 C680,270 712,310 690,350 C676,376 650,392 640,410 Z'
    anal='M480,610 C470,700 500,800 580,830 C630,846 650,800 620,772 C664,770 680,720 650,690 C630,670 620,650 624,628 Z'
    body='M400,520 C420,430 520,392 620,396 C720,400 790,450 792,522 C794,594 724,642 620,646 C520,650 420,610 400,520 Z'
    sil=f'<path d="{tail}" fill="url(#acc{u})"/><path d="{anal}" fill="url(#acc{u})"/><path d="{dors}" fill="url(#acc{u})"/><path d="{body}" fill="url(#body{u})"/>'
    sil+=f'<path d="M640,560 C612,560 580,590 572,626 C600,630 640,610 652,584 Z" fill="url(#fin{u})"/>'
    face=eye(700,488,.9)+smile(718,570,62)+blush(640,556)
    return sil, face

def puffer(u, x):
    spikes=''
    for i in range(14):
        a=math.radians(-160+i*(320/13)); cx,cy,r=545,530,236
        bx,by=cx+r*math.cos(a),cy+r*math.sin(a); tx,ty=cx+(r+50)*math.cos(a),cy+(r+50)*math.sin(a)
        px,py=-math.sin(a)*22,math.cos(a)*22
        spikes+=f'<path d="M{bx+px:.0f},{by+py:.0f} Q{tx:.0f},{ty:.0f} {tx:.0f},{ty:.0f} L{bx-px:.0f},{by-py:.0f} Z" fill="url(#fin{u})" stroke="#E9E2FF" stroke-width="10" stroke-linejoin="round"/>'
    tail='M330,530 C290,480 250,450 220,456 C196,462 192,500 210,530 C192,560 196,598 220,604 C250,610 290,580 330,530 Z'
    sil=spikes+f'<path d="{tail}" fill="url(#fin{u})"/><circle cx="545" cy="530" r="240" fill="url(#body{u})"/>'
    sil+=f'<path d="M560,640 C530,630 494,650 480,680 C500,696 540,690 562,668 Z" fill="url(#fin{u})"/>'
    face=eye(660,470,1.05)+f'<circle cx="760" cy="572" r="20" fill="none" stroke="{INK}" stroke-width="14"/>'+blush(650,570)
    return sil, face

def clown(u, x):
    sil, face = bubs(u, x)
    body='M352,520 C380,404 500,338 624,340 C744,342 830,420 830,528 C830,640 738,708 618,710 C494,712 380,640 352,520 Z'
    bands=(f'<path d="M520,300 C486,420 486,620 520,760 L590,760 C556,620 556,420 590,300 Z" fill="{x}"/>'
           f'<path d="M400,300 C380,420 380,620 400,760 L450,760 C430,620 430,420 450,300 Z" fill="{x}"/>')
    sil=sil.replace(f'<path d="{body}" fill="url(#body{u})"/>', f'<path d="{body}" fill="url(#body{u})"/>'+clip_body(u+'c', body, bands))
    sil=sil.replace(f'fill="url(#fin{u})"', f'fill="url(#acc{u})"', 2)
    return sil, face

def angel(u, x):
    body='M390,540 C420,420 520,356 620,366 C720,376 792,456 792,540 C792,624 720,704 620,714 C520,724 420,660 390,540 Z'
    dors='M470,410 C456,300 510,196 630,160 C604,250 640,330 700,396 Z'
    anal='M470,670 C456,780 510,870 630,900 C604,820 640,746 700,684 Z'
    tail='M400,540 C350,490 300,460 262,468 C236,474 232,510 248,540 C232,570 236,606 262,612 C300,620 350,590 400,540 Z'
    stripes=(f'<path d="M560,340 C540,450 540,630 560,740 L600,740 C580,630 580,450 600,340 Z" fill="{x}" opacity=".85"/>'
             f'<path d="M450,360 C440,460 440,620 450,720 L480,720 C470,620 470,460 480,360 Z" fill="{x}" opacity=".85"/>')
    sil=(f'<path d="{tail}" fill="url(#fin{u})"/><path d="{dors}" fill="url(#acc{u})"/><path d="{anal}" fill="url(#acc{u})"/>'
         f'<path d="{body}" fill="url(#body{u})"/>'+clip_body(u+'a', body, stripes))
    face=eye(700,510,.9)+smile(716,590,58)+blush(650,580)
    return sil, face

def neon(u, x):
    body='M300,530 C360,440 520,410 650,420 C760,430 820,480 830,530 C820,585 760,630 650,640 C520,650 360,620 300,530 Z'
    tail='M320,530 C280,480 240,450 206,452 C180,456 178,492 196,530 C178,568 180,604 206,608 C240,610 280,580 320,530 Z'
    dors='M520,430 C530,380 560,350 600,348 C620,350 620,380 600,420 Z'
    inner=(f'<path d="M280,600 L640,600 C640,560 600,546 560,546 L280,546 Z" fill="#FF4D6D"/>'
           f'<path d="M280,500 C420,488 560,486 700,500 L700,530 C560,520 420,522 280,534 Z" fill="#2FE3FF"/>')
    sil=(f'<path d="{tail}" fill="url(#fin{u})"/><path d="{dors}" fill="url(#fin{u})"/><path d="{body}" fill="url(#body{u})"/>'
         +clip_body(u+'n', body, inner))
    face=eye(730,480,.85)+smile(752,560,56)+blush(690,560)
    return sil, face

def discus(u, x):
    fins='M330,530 C330,370 450,272 600,276 C700,280 770,340 790,420 L790,640 C770,720 700,782 600,786 C450,790 330,690 330,530 Z'
    body='M370,530 C370,400 470,320 590,320 C710,320 800,410 800,530 C800,650 710,740 590,740 C470,740 370,660 370,530 Z'
    tail='M360,530 C310,470 260,430 222,436 C194,442 190,494 210,530 C190,566 194,618 222,624 C260,630 310,590 360,530 Z'
    waves=''.join(f'<path d="M340,{y} C400,{y-24} 460,{y+24} 520,{y} C540,{y-8} 556,{y-10} 570,{y-10}" stroke="{x}" stroke-width="24" stroke-linecap="round" fill="none" opacity=".7"/>' for y in (440,620))
    sil=(f'<path d="{tail}" fill="url(#fin{u})"/><path d="{fins}" fill="url(#acc{u})"/><path d="{body}" fill="url(#body{u})"/>'
         +clip_body(u+'d', body, waves))
    face=eye(700,500,.95)+smile(712,590,60)+blush(640,580)
    return sil, face

def guppy(u, x):
    body='M500,530 C520,460 610,430 690,440 C770,450 812,490 812,530 C812,578 760,612 690,616 C610,620 520,600 500,530 Z'
    tail='M540,530 C460,420 330,320 220,340 C150,354 140,440 150,530 C140,620 150,706 220,720 C330,740 460,640 540,530 Z'
    dots=''.join(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#fff" opacity=".7"/>' for cx,cy,r in ((260,440,16),(230,540,20),(270,630,14),(330,500,12),(340,590,16)))
    dors='M600,450 C600,400 630,360 680,350 C700,360 690,400 670,440 Z'
    sil=f'<path d="{tail}" fill="url(#acc{u})"/>{dots}<path d="{dors}" fill="url(#fin{u})"/><path d="{body}" fill="url(#body{u})"/>'
    face=eye(728,500,.8)+smile(744,568,52)+blush(690,560)
    return sil, face

def goldfish(u, x):
    body='M380,560 C380,430 480,350 600,350 C730,350 810,440 810,560 C810,680 720,750 600,750 C470,750 380,680 380,560 Z'
    tail=('M410,560 C340,470 250,380 180,400 C130,416 140,480 190,520 C150,540 140,600 190,620 C140,660 150,730 210,730 C290,730 360,650 410,600 Z')
    wen=''.join(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#acc{u})"/>' for cx,cy,r in ((640,372,56),(712,392,52),(580,392,46),(760,436,44),(676,346,40)))
    dors='M520,370 C510,300 540,250 600,240 C620,260 620,300 610,350 Z'
    sil=f'<path d="{tail}" fill="url(#acc{u})"/><path d="{dors}" fill="url(#fin{u})"/><path d="{body}" fill="url(#body{u})"/>{wen}'
    sil+=f'<path d="M620,650 C590,640 552,660 536,692 C560,708 600,700 622,676 Z" fill="url(#fin{u})"/>'
    face=eye(712,524,.95)+smile(730,610,60)+blush(660,600)
    return sil, face

def koi(u, x):
    body='M280,540 C340,450 500,410 640,420 C760,430 830,480 838,540 C830,600 760,650 640,660 C500,670 340,630 280,540 Z'
    tail='M310,540 C260,480 210,430 170,436 C140,442 140,490 160,540 C140,590 140,638 170,644 C210,650 260,600 310,540 Z'
    spots=(f'<path d="M560,420 C600,470 660,480 700,440 C690,420 640,410 560,420 Z" fill="{x}"/>'
           f'<ellipse cx="440" cy="520" rx="70" ry="50" fill="{x}"/><ellipse cx="560" cy="610" rx="50" ry="34" fill="{x}"/>')
    sil=(f'<path d="{tail}" fill="url(#acc{u})"/><path d="{body}" fill="url(#body{u})"/>'+clip_body(u+'k', body, spots)
         +f'<path d="M560,630 C540,660 500,690 470,700 C490,720 540,712 580,660 Z" fill="url(#fin{u})"/>'
         +f'<path d="M520,430 C530,390 570,370 610,372 C620,392 610,412 600,426 Z" fill="url(#fin{u})"/>')
    face=(eye(740,500,.85)+smile(756,566,52)+blush(700,566)
          +f'<path d="M820,560 C850,580 860,620 846,650" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round"/>')
    return sil, face

CHAR = dict(bubs=bubs, betta=betta, puffer=puffer, clown=clown, angel=angel, neon=neon, discus=discus, guppy=guppy, goldfish=goldfish, koi=koi)

# ---- seasonal extras
def santa_hat(u):  # on the puffer's head
    return ('<path d="M470,330 C520,200 650,170 760,230 C800,252 820,300 812,340 C760,300 700,290 640,300 C580,310 520,330 470,330 Z" fill="#E8202A"/>'
            '<path d="M450,330 C560,290 700,280 810,330 L800,380 C700,334 560,344 460,384 Z" fill="#fff"/><circle cx="822" cy="340" r="40" fill="#fff"/>')
def snow():
    r=random.Random(3)
    return ''.join(f'<circle cx="{r.randint(40,990)}" cy="{r.randint(40,990)}" r="{r.choice((6,8,10,12))}" fill="#fff" opacity=".8"/>' for _ in range(26))
def mai(cx, cy, s=1.0):
    pet=''.join(f'<circle cx="{cx+28*s*math.cos(math.radians(a)):.0f}" cy="{cy+28*s*math.sin(math.radians(a)):.0f}" r="{24*s:.0f}" fill="#FFD23F"/>' for a in range(-90,270,72))
    return pet+f'<circle cx="{cx}" cy="{cy}" r="{12*s:.0f}" fill="#E8202A"/>'
def star(cx, cy, r, fill):
    pts=' '.join(f'{cx+(r if i%2==0 else r*.45)*math.cos(math.radians(-90+i*36)):.0f},{cy+(r if i%2==0 else r*.45)*math.sin(math.radians(-90+i*36)):.0f}' for i in range(10))
    return f'<polygon points="{pts}" fill="{fill}" stroke="#FFD23F" stroke-width="10" stroke-linejoin="round"/>'
def witch_hat():
    return ('<path d="M470,350 L640,90 C660,140 690,240 720,330 Z" fill="#2B1B4A"/>'
            '<ellipse cx="600" cy="350" rx="190" ry="40" fill="#2B1B4A"/><rect x="520" y="300" width="170" height="34" rx="8" fill="#FF8A3D"/>')
def shades():
    return (f'<path d="M620,440 L820,440 C822,530 792,556 754,556 C716,556 704,516 704,488 L690,488 C690,516 676,556 640,556 C602,556 584,526 584,462 Z" fill="{INK}"/>'
            '<path d="M612,466 L660,466 C656,486 646,496 634,496 Z" fill="#fff" opacity=".5"/>'
            f'<path d="M560,462 L612,456" stroke="{INK}" stroke-width="12" stroke-linecap="round"/>')
def heart(cx, cy, s, fill):
    return f'<path transform="translate({cx} {cy}) scale({s})" d="M0,30 C-40,-10 -60,-40 -30,-60 C-10,-72 0,-56 0,-46 C0,-56 10,-72 30,-60 C60,-40 40,-10 0,30 Z" fill="{fill}"/>'

def icon(pal, char, u='x', extra_under='', extra_over='', face_swap=None, scale=1.1, dy=-25):
    sil, face = CHAR[char](u, P[pal][4])
    if face_swap: face = face_swap(face)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">{defs(pal,u)}{extra_under}'
            f'<g transform="translate(512 512) scale({scale}) translate(-512 {-512+dy})"><g filter="url(#sh{u})">{sil}</g>{face}</g>'
            f'{extra_over}</svg>')


def seasonal():
    out = []
    out.append(('tet','Tết', icon('ember','koi','t', extra_over=mai(150,170,1.3)+mai(860,820,1.1)+mai(250,860,.8)+mai(880,190,.7))))
    moon = '<circle cx="770" cy="250" r="150" fill="#FFF3B0" opacity=".95"/>'
    lantern = '<path d="M250,0 L250,180" stroke="#FFD23F" stroke-width="8"/>'+star(250,260,90,'#E8202A')
    out.append(('trungthu','Trung Thu', icon('night','bubs','m', extra_under=moon, extra_over=lantern)))
    out.append(('noel','Giáng sinh', icon('night','puffer','n', extra_under=snow(), extra_over='', face_swap=lambda f: f+'').replace('</g></svg>', santa_hat('n')+'</g></svg>', 1)))
    out.append(('halloween','Halloween', icon('grape','bubs','h', extra_under='<circle cx="820" cy="220" r="110" fill="#FFB347"/>').replace('</g></svg>', witch_hat()+'</g></svg>',1)))
    hearts = heart(880,420,1.0,'#fff')+heart(840,250,.75,'#FFD1E0')+heart(920,150,.5,'#fff')
    out.append(('valentine','Valentine', icon('peach','bubs','v', extra_over=hearts, dy=-5)))
    sun = '<circle cx="830" cy="190" r="120" fill="#FFE36E"/>'
    out.append(('he','Mùa hè', icon('lagoon','bubs','s', extra_under=sun).replace('</g></svg>', shades()+'</g></svg>',1)))
    return out


# ---- the earlier designs (first round)
# palettes
CUR=dict(water='#5FD3E0', bg='#0B1A1D', deep='#0F3036', fg='#FFFFFF', acc='#5FD3E0', site='#1F8A99', ink='#0B1A1D')
NEW=dict(water='#5CC2B5', bg='#0E3B3A', deep='#0A2A2A', fg='#F4EEE1', acc='#7CC46A', site='#2E7D5B', ink='#122423')

def wave(y, amp, x0=0, x1=1024, n=3):
    # smooth wave from x0 to x1 at baseline y, n full periods
    w=(x1-x0)/n; d=f'M{x0},{y}'
    for i in range(n):
        a=x0+i*w
        d+=f' C{a+w*0.25},{y-amp} {a+w*0.25},{y-amp} {a+w*0.5},{y} C{a+w*0.75},{y+amp} {a+w*0.75},{y+amp} {a+w},{y}'
    return d

def book(p, uid):
    L='M498,344 C420,282 300,266 160,300 L160,744 C300,712 420,728 498,792 Z'
    Rp='M526,344 C604,282 724,266 864,300 L864,744 C724,712 604,728 526,792 Z'
    wv=wave(548,22,150,874,3)+' L874,820 L150,820 Z'
    fish='M610,650 C646,606 712,604 744,650 C712,696 646,694 610,650 Z M744,650 L786,618 L776,650 L786,682 Z'
    return f'''<defs><clipPath id="pg{uid}"><path d="{L}"/><path d="{Rp}"/></clipPath></defs>
<rect width="1024" height="1024" fill="{p['bg']}"/>
<g clip-path="url(#pg{uid})"><rect width="1024" height="1024" fill="{p['fg']}"/><path d="{wv}" fill="{p['water']}"/>
<path d="{fish}" fill="{p['fg']}"/><circle cx="800" cy="560" r="14" fill="{p['water']}"/><circle cx="822" cy="508" r="9" fill="{p['water']}"/></g>'''

def at(p, uid):
    wv=wave(560,24,0,1024,2)
    below=wv+' L1024,1024 L0,1024 Z'
    above=wv+' L1024,0 L0,0 Z'
    txt=f'<path d="{AT_PATH}"/>'
    return f'''<defs><clipPath id="up{uid}"><path d="{above}"/></clipPath><clipPath id="dn{uid}"><path d="{below}"/></clipPath></defs>
<rect width="1024" height="1024" fill="{p['bg']}"/><path d="{below}" fill="{p['deep']}"/>
<g clip-path="url(#up{uid})" fill="{p['fg']}">{txt}</g><g clip-path="url(#dn{uid})" fill="{p['water']}">{txt}</g>'''

def leaffish(p, uid):
    top='M250,520 C330,350 560,322 726,512 L250,520 Z'
    bot='M250,520 L726,512 C560,702 330,690 250,520 Z'
    tail='M700,512 L848,392 C826,470 826,556 848,632 Z'
    return f'''<rect width="1024" height="1024" fill="{p['bg']}"/>
<path d="{tail}" fill="{p['acc']}" opacity=".8"/><path d="{bot}" fill="{p['acc']}" opacity=".8"/><path d="{top}" fill="{p['acc']}"/>
<path d="M760,512 C600,500 470,496 330,514 C470,508 600,514 760,520 Z" fill="{p['bg']}"/>
<circle cx="338" cy="462" r="19" fill="{p['bg']}"/>'''


AT_PATH = 'M231.11606201171867 592.8027709960937V557.1543481445312H422.80280761718745V592.8027709960937ZM517.9801635742188 688.4033911132813 560.9688964843749 704.5560620117187V720.0H385.4659252929687V704.5560620117187L432.4969189453125 689.3571923828125L311.65181396484365 396.79485839843744H324.97746582031243L211.25462158203118 689.2259252929688L256.04561523437496 704.5560620117187V720.0H126.00226074218743V704.5560620117187L169.68226074218742 689.3571923828125L312.53465820312493 338.46534179687495H369.1164990234374Z M684.2952416992188 359.04506835937497H764.0556787109375V689.094658203125L807.8140014648438 704.5560620117187V720.0H640.8169189453125V704.5560620117187L684.2952416992188 689.094658203125ZM869.736298828125 378.436025390625H574.4315405273437L605.9937646484375 367.2878759765625L560.5977392578125 456.46869628906245L538.8884594726562 453.5723608398437L552.0309936523438 320.22986328124995H565.4890063476563L608.076025390625 348.03773925781246L576.1115405273438 341.43999999999994H867.776298828125L841.9813671875 348.03773925781246L884.5683862304688 320.22986328124995H898.0263989257812L911.1689331054688 453.5723608398437L889.4596533203126 456.46869628906245L844.3436279296875 367.2878759765625Z'

# (id, how it's drawn); the names a reader sees are in AppIcons.swift.
def ICONS():
    W = lambda i: f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">{i}</svg>'
    fish = [('bubs-pink','pink','bubs'), ('bubs-aqua','aqua','bubs'), ('bubs-sunrise','sunrise','bubs'),
            ('betta-grape','grape','betta'), ('betta-reef','reef','betta'), ('betta-night','night','betta'),
            ('puffer-lagoon','lagoon','puffer'), ('puffer-peach','peach','puffer'), ('puffer-lime','lime','puffer'),
            ('clown-sky','sky','clown'), ('clown-aqua','aqua','clown'),
            ('angel-night','night','angel'), ('angel-mint','mint','angel'),
            ('neon-night','night','neon'), ('neon-lime','lime','neon'),
            ('discus-sunrise','sunrise','discus'), ('discus-grape','grape','discus'),
            ('guppy-pink','pink','guppy'), ('guppy-lagoon','lagoon','guppy'),
            ('goldfish-peach','peach','goldfish'), ('goldfish-sky','sky','goldfish'),
            ('koi-mint','mint','koi'), ('koi-reef','reef','koi')]
    out = [(i, icon(p, c)) for i, p, c in fish]
    out += [(i, s) for i, _, s in seasonal()]
    out += [('at-water', W(at(CUR, 'w'))), ('book', W(book(NEW, 'b'))), ('leaf-fish', W(leaffish(NEW, 'f')))]
    return out

# Pixel size → the slot that uses it: (idiom, size in points, scale). Home-screen sizes only: iOS scales them down for
# Spotlight, Settings and notifications, as it did for alternate icons listed by file (CFBundleIconFiles, 60 pt only).
# With the 40/29/20 slots too, the 32 icons cost 7.55 MB of the archive instead of 4.8.
SLOTS = {120: [('iphone','60x60','2x')], 180: [('iphone','60x60','3x')],
         152: [('ipad','76x76','2x')], 167: [('ipad','83.5x83.5','2x')]}

if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    cat = os.path.join(here, '..', 'AquaTome', 'Assets.xcassets')
    for i, svg in ICONS():
        d = os.path.join(cat, f'AppIcon-{i}.appiconset'); os.makedirs(d, exist_ok=True)
        for old in os.listdir(d): os.remove(os.path.join(d, old))
        with tempfile.NamedTemporaryFile('w', suffix='.svg', delete=False) as t: t.write(svg)
        images = []
        for px, slots in SLOTS.items():
            f = f'{px}.png'
            subprocess.run(['rsvg-convert', '-w', str(px), '-h', str(px), '-b', 'black', t.name, '-o', os.path.join(d, f)], check=True)
            images += [{'filename': f, 'idiom': idiom, 'scale': scale, 'size': size} for idiom, size, scale in slots]
        os.unlink(t.name)
        json.dump({'images': images, 'info': {'author': 'xcode', 'version': 1}}, open(os.path.join(d, 'Contents.json'), 'w'), indent=2)
        print(i)
