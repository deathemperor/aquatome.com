import json, os, sys, unicodedata, re
ROOT = sys.argv[1]
M = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'commons-photos.json')))
def photo(key, caption=None):
    m = dict(M[key]); 
    if caption: m['caption'] = caption
    return m
def slugify(t):
    t = unicodedata.normalize('NFD', t); t = re.sub(r'[̀-ͯ]', '', t).replace('đ','d').replace('Đ','d').lower()
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')
def write(kind, id, entity, vi):
    d = os.path.join(ROOT, kind, id); os.makedirs(d, exist_ok=True)
    json.dump(entity, open(os.path.join(d,'entity.json'),'w'), ensure_ascii=False, indent=2)
    vi.setdefault('altNames', []); vi.setdefault('sections', {}); vi.setdefault('quality', {'score': 0.92, 'indexable': True})
    vi['slug'] = slugify(vi['name'])
    json.dump(vi, open(os.path.join(d,'vi.json'),'w'), ensure_ascii=False, indent=2)
SF = lambda sp: f'https://www.seriouslyfish.com/species/{sp}'
R = lambda a,b: {'min':a,'max':b}
def sec(key, source, url, en): return {'key':key,'source':source,'sourceUrl':url,'html':f'<p>{en}</p>'}
P = lambda vi: f'<p>{vi}</p>'

SPECIES = [
 dict(id='paracheirodon-axelrodi', sci='Paracheirodon axelrodi', order='Characiformes', family='Characidae', genus='Paracheirodon', group='tetras',
      places=['south-america','brazil','rio-negro'], photo='Cardinal Paracheirodon axelrodi (3).jpg', name='Cá neon vua', alt=['Cardinal tetra'],
      card={'tempC':[{'source':'seriouslyfish','value':R(24,30)},{'source':'glaser','value':R(23,27)}],'ph':[{'source':'seriouslyfish','value':R(4,6)}],'gh':[{'source':'seriouslyfish','value':R(1,6)}],'sizeCm':[{'source':'seriouslyfish','value':5}],'tankCm':[{'source':'seriouslyfish','value':60}],'difficulty':[{'source':'seriouslyfish','value':3}]},
      secs=[('quickFacts','seriouslyfish','Cá đàn nhỏ, màu đỏ và xanh ánh kim, sống tốt trong bể nước mềm có nhiều cây.'),
            ('habitat','seriouslyfish','Sống ở các suối nước đen chảy chậm thuộc lưu vực Rio Negro, nước có màu trà do lá mục.'),
            ('waterConditions','seriouslyfish','Ưa nước mềm, hơi chua; nên ổn định thông số trước khi thả.'),
            ('diet','seriouslyfish','Ăn tạp thiên về động vật: thức ăn khô cỡ nhỏ xen kẽ trùn chỉ, artemia.'),
            ('behaviour','seriouslyfish','Hiền, nên nuôi đàn từ 10 con trở lên để cá tự tin và lên màu đẹp. Hiểu rõ chu trình nitơ trước khi thả đàn lớn.'),
            ('dimorphism','seriouslyfish','Con cái thường tròn bụng hơn con đực khi trưởng thành.'),
            ('reproduction','seriouslyfish','Đẻ rải trứng, cần nước rất mềm và ánh sáng yếu.'),
            ('reproduction','glaser','Ghi chú nhập khẩu: cá hoang dã cần thời gian thích nghi trước khi cho sinh sản.')],
      slots=[{'category':'be-ca','keywords':['bể kính 60cm']},{'category':'loc','keywords':['lọc thùng 600L/h']},{'category':'thuc-an','keywords':['thức ăn cá tetra']}],
      videos=[{'youtubeId':'aaaaaaaaaaa','title':'Video mẫu: đàn neon vua trong bể thủy sinh','durationSec':724,'lang':'vi'}]),
 dict(id='paracheirodon-innesi', sci='Paracheirodon innesi', order='Characiformes', family='Characidae', genus='Paracheirodon', group='tetras',
      places=['south-america','peru','colombia','brazil'], photo='Neonsalmler Paracheirodon innesi.jpg', name='Cá neon xanh', alt=['Neon tetra'],
      card={'tempC':[{'source':'seriouslyfish','value':R(20,26)}],'ph':[{'source':'seriouslyfish','value':R(5,7)}],'sizeCm':[{'source':'seriouslyfish','value':4}],'tankCm':[{'source':'seriouslyfish','value':60}],'difficulty':[{'source':'seriouslyfish','value':2}]},
      secs=[('quickFacts','seriouslyfish','Loài cá đàn phổ biến nhất cho người mới, chịu được nhiệt độ mát hơn neon vua.'),
            ('habitat','seriouslyfish','Suối rừng thượng nguồn Amazon, nước trong đến hơi đục.'),
            ('behaviour','seriouslyfish','Là cá đàn hiền lành, hợp bể cộng đồng với cá cùng cỡ.'),
            ('dimorphism','seriouslyfish','Con đực thon hơn; vạch xanh của con cái hơi cong do bụng tròn.')],
      slots=[{'category':'be-ca','keywords':['bể kính 60cm']},{'category':'thuc-an','keywords':['thức ăn cá neon']}]),
 dict(id='mikrogeophagus-ramirezi', sci='Mikrogeophagus ramirezi', order='Cichliformes', family='Cichlidae', genus='Mikrogeophagus', group='cichlids',
      places=['south-america','colombia','venezuela'], photo='Mikrogeophagus ramirezi male.jpg', name='Cá phượng hoàng', alt=['Ram cichlid'],
      card={'tempC':[{'source':'seriouslyfish','value':R(27,30)}],'ph':[{'source':'seriouslyfish','value':R(5,7)}],'sizeCm':[{'source':'seriouslyfish','value':7}],'tankCm':[{'source':'seriouslyfish','value':60}],'difficulty':[{'source':'seriouslyfish','value':5}]},
      secs=[('quickFacts','seriouslyfish','Cichlid lùn sặc sỡ, cần nước ấm và sạch.'),
            ('maintenance','seriouslyfish','Thay nước đều đặn, tránh nitrat tích tụ.'),
            ('reproduction','seriouslyfish','Đẻ trên đá phẳng, cả bố và mẹ cùng chăm trứng.'),
            ('reproduction','aquariumbreeder','Mẹo nhân giống: tách cặp ra bể riêng, nâng nhiệt độ lên 29°C.')],
      slots=[{'category':'suoi','keywords':['sưởi bể cá 100W']}]),
 dict(id='symphysodon-aequifasciatus', sci='Symphysodon aequifasciatus', order='Cichliformes', family='Cichlidae', genus='Symphysodon', group='cichlids',
      places=['south-america','brazil','peru'], photo='Blue Discus.jpg', name='Cá đĩa', alt=['Discus'],
      card={'tempC':[{'source':'seriouslyfish','value':R(28,31)},{'source':'sprucepets','value':R(28,31)}],'ph':[{'source':'seriouslyfish','value':R(4.5,6.5)}],'sizeCm':[{'source':'seriouslyfish','value':15}],'tankCm':[{'source':'seriouslyfish','value':120}],'difficulty':[{'source':'seriouslyfish','value':7}]},
      secs=[('quickFacts','seriouslyfish','"Vua của bể nước ngọt", đòi hỏi bể lớn và nước rất ổn định.'),
            ('aquariumSize','seriouslyfish','Nuôi nhóm trong bể từ 120 cm trở lên.'),
            ('maintenance','sprucepets','Thay nước nhiều và thường xuyên là chìa khóa.')],
      slots=[{'category':'be-ca','keywords':['bể kính 120cm']},{'category':'loc','keywords':['lọc thùng 1200L/h']}]),
 dict(id='danio-margaritatus', sci='Danio margaritatus', order='Cypriniformes', family='Danionidae', genus='Danio', group='danios',
      places=['asia','myanmar'], photo='Danio Margaritatus malle (zoom).jpg', name='Cá galaxy', alt=['Celestial pearl danio'],
      card={'tempC':[{'source':'seriouslyfish','value':R(20,25)}],'ph':[{'source':'seriouslyfish','value':R(6.5,7.5)}],'sizeCm':[{'source':'seriouslyfish','value':2.5}],'tankCm':[{'source':'seriouslyfish','value':45}],'difficulty':[{'source':'seriouslyfish','value':3}]},
      secs=[('quickFacts','seriouslyfish','Cá nano chấm sao, hợp bể nhỏ trồng nhiều cây.'),
            ('habitat','seriouslyfish','Ao cạn nhiều cỏ ở cao nguyên Shan, Myanmar.')],
      slots=[{'category':'be-ca','keywords':['bể nano 45cm']}]),
 dict(id='neocaridina-davidi', sci='Neocaridina davidi', order='Decapoda', family='Atyidae', genus='Neocaridina', group='shrimp',
      places=['asia','china'], photo='Red Cherry Shrimp 1.jpg', name='Tép red cherry', alt=['Cherry shrimp'],
      card={'tempC':[{'source':'bwaquatics','value':R(18,28)}],'ph':[{'source':'bwaquatics','value':R(6.5,8)}],'sizeCm':[{'source':'bwaquatics','value':3}],'tankCm':[{'source':'bwaquatics','value':30}],'difficulty':[{'source':'bwaquatics','value':1}]},
      secs=[('quickFacts','bwaquatics','Tép dễ nuôi, sinh sản nhanh, dọn rêu tốt.'),
            ('dimorphism','bwaquatics','Con cái đỏ đậm hơn và có yên trứng sau đầu.'),
            ('maintenance','sprucepets','Tránh thuốc chứa đồng; tép rất nhạy cảm.')],
      slots=[{'category':'thuc-an','keywords':['thức ăn tép']}]),
 dict(id='boraras-brigittae', sci='Boraras brigittae', order='Cypriniformes', family='Danionidae', genus='Boraras', group='rasboras',
      places=['asia','indonesia'], photo='Boraras-brigittae-3191524164.jpg', name='Cá boraras đỏ', alt=['Chili rasbora'],
      card={'tempC':[{'source':'seriouslyfish','value':R(22,28)}],'ph':[{'source':'seriouslyfish','value':R(4,7)}],'sizeCm':[{'source':'seriouslyfish','value':2}],'tankCm':[{'source':'seriouslyfish','value':45}],'difficulty':[{'source':'seriouslyfish','value':4}]},
      secs=[('quickFacts','seriouslyfish','Một trong những loài cá nhỏ nhất trong thú chơi, màu đỏ rực.'),
            ('habitat','seriouslyfish','Đầm lầy than bùn ở Borneo, nước rất chua.')],
      slots=[], quality={'score':0.61,'indexable':False}),
 dict(id='apistogramma-cacatuoides', sci='Apistogramma cacatuoides', order='Cichliformes', family='Cichlidae', genus='Apistogramma', group='cichlids',
      places=['south-america','peru','colombia'], photo='Cacatuoides.JPG', name='Cá apisto cacatuoides', alt=['Cockatoo cichlid'],
      card={'tempC':[{'source':'seriouslyfish','value':R(24,29)}],'ph':[{'source':'seriouslyfish','value':R(5,7.5)}],'sizeCm':[{'source':'seriouslyfish','value':9}],'tankCm':[{'source':'seriouslyfish','value':60}],'difficulty':[{'source':'seriouslyfish','value':4}]},
      secs=[('quickFacts','seriouslyfish','Cichlid lùn có vây lưng như mào vẹt, con đực rất sặc sỡ.'),
            ('reproduction','seriouslyfish','Đẻ trong hang, con mái canh trứng và bầy con.')],
      slots=[]),
]
for s in SPECIES:
    secs, vi_secs = [], {}
    for key, src, vi in s['secs']:
        url = SF(s['id']) if src=='seriouslyfish' else f"https://example.invalid/{src}/{s['id']}"
        secs.append(sec(key, src, url, f'[EN source text placeholder for {key}]'))
        vi_secs[f'{key}:{src}'] = P(vi)
    ent = {'id':s['id'],'scientificName':s['sci'],'order':s['order'],'family':s['family'],'genus':s['genus'],'group':s['group'],
           'places':s['places'],'dataCard':s['card'],'sections':secs,'photos':[photo(s['photo'])],'videos':s.get('videos',[]),
           'productSlots':s['slots'],'updatedAt':'2026-10-28'}
    vi = {'name':s['name'],'altNames':s['alt'],'sections':vi_secs}
    if 'quality' in s: vi['quality'] = s['quality']
    write('species', s['id'], ent, vi)

PLANTS = [
 ('anubias-barteri-nana','Anubias barteri var. nana',1,'low','none','slow',['foreground','epiphyte'],'Anubias barteri var. nana.jpg','Ráy nana',
  [('quickFacts','tropica','Cây lá dày, mọc chậm, buộc lên đá hoặc lũa; gần như không thể chết.')], ['anubias nana']),
 ('cryptocoryne-wendtii','Cryptocoryne wendtii',1,'low','optional','slow',['midground'],'-Cryptocoryne wendtii- from Tropica farm.JPG','Cryptocoryne wendtii',
  [('quickFacts','tropica','Cây trung cảnh bền bỉ, nhiều biến thể màu.'),('maintenance','2hraquarist','Có thể "tan lá" khi mới trồng; đừng nhổ, lá mới sẽ mọc lại.')], ['cryptocoryne wendtii']),
 ('micranthemum-monte-carlo','Micranthemum tweediei',2,'medium','optional','medium',['foreground'],'Micranthemum tweediei-1-veda aquarium-bengaluru-India.jpg','Monte Carlo',
  [('quickFacts','tropica','Cây trải thảm tiền cảnh, dễ hơn trân châu ngọc trai.')], ['monte carlo thủy sinh']),
]
for id, sci, diff, light, co2, growth, place, ph, name, secs_, kw in PLANTS:
    secs, vi_secs = [], {}
    for key, src, vi in secs_:
        secs.append(sec(key, src, f'https://example.invalid/{src}/{id}', f'[EN source text placeholder for {key}]')); vi_secs[f'{key}:{src}'] = P(vi)
    write('plants', id, {'id':id,'scientificName':sci,'difficulty':diff,'light':light,'co2':co2,'growth':growth,'placement':place,
        'sections':secs,'photos':[photo(ph)],'productSlots':[{'category':'cay-thuy-sinh','keywords':kw}],'updatedAt':'2026-10-28'},
        {'name':name,'sections':vi_secs})

GUIDES = [
 ('setup-be-dau-tien','setup','2hraquarist','Setup bể thủy sinh đầu tiên','Planted Tank 03 - Flickr - The Wandering Angel.jpg',['paracheirodon-innesi','anubias-barteri-nana'],
  'Bắt đầu với bể 60 cm, phân nền, lọc thùng và đèn vừa phải. Chạy chu trình nitơ ít nhất bốn tuần trước khi thả cá đàn đầu tiên. Đo pH và GH mỗi tuần.'),
 ('loc-cho-be-nano','setup','aquariumcoop','Chọn lọc cho bể nano','Aquarium Sponge Filter foam 1.jpg',['danio-margaritatus','neocaridina-davidi'],
  'Lọc bio (lọc vi sinh bằng mút) rẻ, an toàn cho tép con và đủ cho bể dưới 40 lít.'),
 ('glaser-hang-moi','discovery','glaser','Hàng mới về: những loài hiếm tháng này','Nature Aquarium Aquascape.jpg',['boraras-brigittae','apistogramma-cacatuoides'],
  'Điểm qua các loài mới nhập khẩu, từ cá lùn Borneo đến cichlid Nam Mỹ.'),
]
for id, kind, src, name, ph, mentions, body in GUIDES:
    write('guides', id, {'id':id,'kind':kind,'source':src,'sourceUrl':f'https://example.invalid/{src}/{id}','html':'<p>[EN source text placeholder]</p>',
        'photos':[photo(ph)],'mentions':mentions,'updatedAt':'2026-10-28'}, {'name':name,'body':P(body)})

GLOSS = [('ph','pH','pH',None,'Thang đo độ chua – kiềm của nước, 7 là trung tính.'),
         ('gh','GH','General hardness',None,'Độ cứng tổng: lượng canxi và magie hòa tan trong nước.'),
         ('chu-trinh-nito','Chu trình nitơ','Nitrogen cycle',None,'Quá trình vi sinh chuyển amoniac thành nitrit rồi nitrat.'),
         ('ca-dan','Cá đàn','Shoaling fish',None,'Loài cá sống và bơi theo nhóm, cần nuôi số lượng lớn.')]
for id, name, en, latin, d in GLOSS:
    e = {'id':id,'en':en}
    write('glossary', id, e, {'name':name,'definition':d})

PLACES = [('south-america','continent',None,'Nam Mỹ'),('asia','continent',None,'Châu Á'),('brazil','country','south-america','Brazil'),
          ('peru','country','south-america','Peru'),('colombia','country','south-america','Colombia'),('venezuela','country','south-america','Venezuela'),
          ('rio-negro','river','brazil','Rio Negro'),('myanmar','country','asia','Myanmar'),('thailand','country','asia','Thái Lan'),
          ('vietnam','country','asia','Việt Nam'),('indonesia','country','asia','Indonesia'),('china','country','asia','Trung Quốc')]
for id, kind, parent, name in PLACES:
    e = {'id':id,'kind':kind}
    if parent: e['parent'] = parent
    write('places', id, e, {'name':name})
print('ok')
