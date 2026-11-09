import { expect, test } from 'vitest'
import { rudeWord } from '../moderation/words'

test('a profane or slurring word is found in each language, as written or in its short form', () => {
  expect(rudeWord('Shop này bán cá bệnh, đm thật')).toBe('đm')
  expect(rudeWord('ĐỊT MẸ cái bể này')).toBe('địt')
  expect(rudeWord('Admin là đồ ngu')).toBe('đồ ngu')
  expect(rudeWord('Penjualnya goblok, ikannya mati semua')).toBe('goblok')
  expect(rudeWord('Pemilik laman ini bangang')).toBe('bangang')
  expect(rudeWord('This site is shit')).toBe('shit')
  expect(rudeWord('เว็บนี้ห่วยแม่งเอ๊ย')).toBe('แม่ง')
  expect(rudeWord('โคตรเหี้ยเลยร้านนี้')).toBe('โคตรเหี้ย')
  expect(rudeWord('เชี่ย ปลาตายหมด')).toBe('เชี่ย')
  expect(rudeWord('เชี่ยวะ ตายยกตู้')).toBe('เชี่ย')
  expect(rudeWord('ร้านเหี้ยๆ')).toBe('เหี้ยๆ')
  expect(rudeWord('knn punya seller')).toBe('knn')
  expect(rudeWord('thằng shop khốn kiếp')).toBe('khốn kiếp')
  expect(rudeWord('đẹp vl')).toBe('vl')
  expect(rudeWord('dm shop nhé, cá chết cmnr')).toBe('cmnr')
  expect(rudeWord('Penjualnya kntl')).toBe('kntl')
  expect(rudeWord('cibai punya seller')).toBe('cibai')
  expect(rudeWord('the cycle is fucked')).toBe('fucked')
  // A letter typed again and again counts once.
  expect(rudeWord('vcllll, cá chết hết')).toBe('vcl')
  expect(rudeWord('FUCKKK this tank')).toBe('fuck')
  expect(rudeWord('cmmm shop')).toBe('cmm')
  expect(rudeWord('Admin là đồ   ngu')).toBe('đồ ngu')
  expect(rudeWord('ajg lah, ikannya mati')).toBe('ajg')
  expect(rudeWord('ตัวแม่งดีมาก')).toBe('แม่ง')
  expect(rudeWord('พ่องตาย')).toBe('พ่อง')
  expect(rudeWord('the seller is a wanker')).toBe('wanker')
  expect(rudeWord('đẹp vler, xịn vloz')).toBe('vler')
  expect(rudeWord('shop chó má')).toBe('chó má')
  expect(rudeWord('goblokk, bangsatt')).toBe('goblok')
  expect(rudeWord('vcll cá chết')).toBe('vcl')
  expect(rudeWord('bongok betul seller ni')).toBe('bongok')
  expect(rudeWord('kau bodo')).toBe('kau bodo')
  expect(rudeWord('ดีสัดๆ แพงสัดๆ')).toBe('สัดๆ')
  expect(rudeWord('ไอ้เหี้ยเอ๊ย ปลาตาย')).toBe('เหี้ยเอ๊ย')
  expect(rudeWord('ไอ้ตุ๊ดขายปลา')).toBe('ตุ๊ด')
  expect(rudeWord('แม่งงี้ทุกที')).toBe('แม่ง')
  expect(rudeWord('the wankers at the shop')).toBe('wankers')
  expect(rudeWord('fuking seller')).toBe('fuking')
  // A filter media "VLL" or the province "VL" doesn't hide a curse later in the comment.
  expect(rudeWord('tặng kèm VLL, đẹp vcll')).toBe('vcl')
  expect(rudeWord('VLL xịn, goblokk')).toBe('goblok')
  expect(rudeWord('VL có shop nào, bán cá như cc')).toBe('như cc')
  expect(rudeWord('ĐẸP VL')).toBe('vl')
  expect(rudeWord('shop như lol, đ.m')).toBe('như lol')
  expect(rudeWord('apaan sih njing')).toBe('njing')
  expect(rudeWord('dasar asu, ikannya mati')).toBe('dasar asu')
  expect(rudeWord('cukimai seller')).toBe('cukimai')
  expect(rudeWord('ไอ้เหี้ยเอ้ย ทำเหี้ยอะไร')).toBe('เหี้ยเอ้ย')
  expect(rudeWord('โคตรเหี้ยมากร้านนี้')).toBe('โคตรเหี้ย')
  expect(rudeWord('แม่งอะไรวะ')).toBe('แม่ง')
  expect(rudeWord('ไอ้หน้าหี')).toBe('หน้าหี')
  expect(rudeWord('Penjualnya gobloknya minta ampun')).toBe('gobloknya')
  expect(rudeWord('shiit, the fuuck')).toBe('shit')
  expect(rudeWord('mahal gila babi')).toBe('gila babi')
  expect(rudeWord('อีกระหรี่ร้านนี้')).toBe('กระหรี่')
  expect(rudeWord('ตุ๊ดขายปลา')).toBe('ตุ๊ด')
  expect(rudeWord('đẹp vlon')).toBe('vlon')
  expect(rudeWord('hay vãi cả lol')).toBe('vãi cả lol')
  expect(rudeWord('con điếm bán cá')).toBe('con điếm')
  expect(rudeWord('celaka punya seller')).toBe('celaka punya')
  expect(rudeWord('bodoh bahlul')).toBe('bahlul')
  expect(rudeWord('เชี่ยว่ะ ปลาตายหมด')).toBe('เชี่ย')
  expect(rudeWord('แม่งงงง ตายหมด')).toBe('แม่งงง')
  expect(rudeWord('แพงสัด')).toBe('แพงสัด')
  expect(rudeWord('ไอ้เหี้ย ขายปลาป่วย')).toBe('ไอ้เหี้ย')
  expect(rudeWord('what a shithole')).toBe('shithole')
  expect(rudeWord('cá chết vãi đái')).toBe('vãi đái')
  expect(rudeWord('monyet lu, ikannya mati')).toBe('monyet lu')
  expect(rudeWord('seller kampret')).toBe('kampret')
  expect(rudeWord('anjing lah, mati semua')).toBe('anjing lah')
  expect(rudeWord('ccb punya kedai')).toBe('ccb')
  expect(rudeWord('ไอ้ห่านี่ ปลาตายหมด')).toBe('ไอ้ห่า')
  expect(rudeWord('ไอ้ห่านั่นขายปลาป่วย')).toBe('ไอ้ห่า')
  expect(rudeWord('ร้านนี้แพงเหี้ย')).toBe('แพงเหี้ย')
  expect(rudeWord('ตัวแม่งดีมาก')).toBe('แม่ง')
  expect(rudeWord('what a cocksucker')).toBe('cocksucker')
  expect(rudeWord('fag')).toBe('fag')
  expect(rudeWord('đếch biết gì')).toBe('đếch')
  expect(rudeWord('éo biết')).toBe('éo')
  expect(rudeWord('shop như cứt')).toBe('như cứt')
  expect(rudeWord('thằng chó bán cá')).toBe('thằng chó')
  expect(rudeWord('seller bangsad')).toBe('bangsad')
  expect(rudeWord('bodoh sial')).toBe('bodoh sial')
  expect(rudeWord('sial kau')).toBe('sial kau')
  expect(rudeWord('pergi mampus')).toBe('pergi mampus')
  expect(rudeWord('kaninabei seller')).toBe('kaninabei')
  expect(rudeWord('ko bodo')).toBe('ko bodo')
  // ไอ้ typed without its tone mark, or as ไอ่.
  expect(rudeWord('ไอเหี้ย ขายปลาป่วย')).toBe('ไอเหี้ย')
  expect(rudeWord('ไอ่เหี้ย ขายปลาป่วย')).toBe('ไอ่เหี้ย')
  expect(rudeWord('ไอควาย')).toBe('ไอควาย')
  expect(rudeWord('ไอห่านี่')).toBe('ไอห่า')
  expect(rudeWord('แมร่งตายหมด')).toBe('แมร่ง')
  expect(rudeWord('อีกะหรี่ร้านนี้')).toBe('อีกะหรี่')
  expect(rudeWord('ร้านนี้เหี้ยมาก')).toBe('ร้านนี้เหี้ย')
  expect(rudeWord('เหี้ยอะไรเนี่ย')).toBe('เหี้ยอะไร')
  expect(rudeWord('cái cc gì vậy')).toBe('cái cc')
  expect(rudeWord('đẹp v.l')).toBe('v.l')
  expect(rudeWord('đẹp cmn')).toBe('cmn')
  expect(rudeWord('đắt cmn, lâu cmn')).toBe('cmn')
  expect(rudeWord('hết cmn rồi')).toBe('cmn')
  expect(rudeWord('cá chết sml')).toBe('sml')
  expect(rudeWord('thằng ml bán cá')).toBe('thằng ml')
  expect(rudeWord('ngu cc')).toBe('ngu cc')
  expect(rudeWord('banyak bacot lu')).toBe('bacot')
  expect(rudeWord('mampus lu')).toBe('mampus lu')
  expect(rudeWord('bodoh punya seller')).toBe('bodoh punya')
  expect(rudeWord('ร้านนี้แย่เหี้ยเลย')).toBe('แย่เหี้ย')
  expect(rudeWord('ส่งช้าเหี้ยเลย')).toBe('เหี้ยเลย')
  expect(rudeWord('ปลาตายห่าหมด')).toBe('ตายห่า')
  expect(rudeWord('เสือกส่งปลาตายมา')).toBe('เสือก')
  expect(rudeWord('ช้าสัด ปลาตาย')).toBe('ช้าสัด')
  // A guard's word is a whole word: "to" isn't "o", the abbreviation of ở.
  expect(rudeWord('cá to vl')).toBe('vl')
  expect(rudeWord('shop dở vl')).toBe('vl')
  expect(rudeWord('jadi knn')).toBe('knn')
  expect(rudeWord('vãi cc')).toBe('vãi cc')
  expect(rudeWord('chó đẻ, giao thiếu')).toBe('chó đẻ')
  expect(rudeWord('to cmn luôn')).toBe('cmn')
  expect(rudeWord('anjing elo')).toBe('anjing elo')
  expect(rudeWord('ndasmu')).toBe('ndasmu')
  expect(rudeWord('palui betul kau')).toBe('palui')
  expect(rudeWord('กวนตีนจริง')).toBe('กวนตีน')
  expect(rudeWord('cmn shop này đểu')).toBe('cmn')
  expect(rudeWord('đell biết')).toBe('đell')
  expect(rudeWord('Anjing, ikan gue mati semua')).toBe('anjing')
  expect(rudeWord('anjing! mati semua')).toBe('anjing')
  expect(rudeWord('emang anjing')).toBe('emang anjing')
  expect(rudeWord('pala hotak kau')).toBe('pala hotak')
  expect(rudeWord('anak lahanat')).toBe('lahanat')
  expect(rudeWord('เเม่งตายหมด')).toBe('แม่ง')
  expect(rudeWord('ช้าสัด!')).toBe('ช้าสัด')
  expect(rudeWord('ช้าสัด555')).toBe('ช้าสัด')
  expect(rudeWord('เว็บนี้เหี้ย')).toBe('เว็บนี้เหี้ย')
  expect(rudeWord('ไอ้สารเลว')).toBe('สารเลว')
  expect(rudeWord('ขายถูกเหี้ย ปลาตาย')).toBe('ถูกเหี้ย')
  expect(rudeWord('anjing loe')).toBe('anjing loe')
  expect(rudeWord('ngentotin')).toBe('ngentotin')
  expect(rudeWord('kbk harga ni')).toBe('kbk')
  expect(rudeWord('ปลาสวยเหี้ย')).toBe('สวยเหี้ย')
  expect(rudeWord('เฮงซวย ปลาตายอีก')).toBe('เฮงซวย')
  expect(rudeWord('seller berengsek')).toBe('berengsek')
  expect(rudeWord('babi la seller ni')).toBe('babi la')
  expect(rudeWord('โครตเหี้ยมาก')).toBe('โครตเหี้ย')
  expect(rudeWord('ไอ้หมาขายปลาป่วย')).toBe('ไอ้หมา')
  expect(rudeWord('dientot penjualnya')).toBe('dientot')
  expect(rudeWord('dancuk, ikannya mati')).toBe('dancuk')
  expect(rudeWord('celaka ko')).toBe('celaka ko')
  expect(rudeWord('this canister is a pain in the ass')).toBe('pain in the ass')
  expect(rudeWord('fcuk this cycle')).toBe('fcuk')
  expect(rudeWord('ปลาห่วยเหี้ย')).toBe('ห่วยเหี้ย')
  expect(rudeWord('ดีสัด')).toBe('ดีสัด')
  expect(rudeWord('สัด ปลาตายหมด')).toBe('สัด')
  expect(rudeWord('สาส ปลาตาย')).toBe('สาส')
  expect(rudeWord('แม่งง ตายหมด')).toBe('แม่งง')
  expect(rudeWord('mahal banget anjing')).toBe('mahal banget anjing')
  expect(rudeWord('apaan sih anjing')).toBe('sih anjing')
  expect(rudeWord('penjualnya anjing')).toBe('penjualnya anjing')
  expect(rudeWord('dasar gobloklah')).toBe('gobloklah')
  expect(rudeWord('kimaklah kedai ni')).toBe('kimaklah')
  expect(rudeWord('bangangla kau')).toBe('bangangla')
  expect(rudeWord('คนขายเหี้ย')).toBe('คนขายเหี้ย')
  expect(rudeWord('แม่ค้าเหี้ย ปลาตาย')).toBe('แม่ค้าเหี้ย')
  expect(rudeWord('ร้านนี้ขายของเหี้ย')).toBe('ขายของเหี้ย')
  expect(rudeWord('ส่งช้าสัดเลย')).toBe('ช้าสัด')
  expect(rudeWord('สัดเอ๊ย ปลาตาย')).toBe('สัดเอ๊ย')
  expect(rudeWord('đắt cmnl')).toBe('cmnl')
  expect(rudeWord('mua về thì cc')).toBe('thì cc')
  expect(rudeWord('bego amat sih')).toBe('bego amat')
  expect(rudeWord('penjual anjing amat')).toBe('anjing amat')
  expect(rudeWord('kedai laknat')).toBe('laknat')
  expect(rudeWord('làm ăn như shit vậy')).toBe('shit')
  expect(rudeWord('đồ như cc')).toBe('như cc')
  expect(rudeWord('buồi to')).toBe('buồi')
  expect(rudeWord('dick')).toBe('dick')
  expect(rudeWord('DICK')).toBe('dick')
  expect(rudeWord('ปลาเหี้ยจริงๆ')).toBe('เหี้ยจริง')
  expect(rudeWord('ช่างเหี้ย ปลาตาย')).toBe('ช่างเหี้ย')
  expect(rudeWord('ร้านโคตรหี')).toBe('โคตรหี')
  expect(rudeWord('หี ปลาตาย')).toBe('หี')
  expect(rudeWord('ถูกเหี้ยนะ')).toBe('ถูกเหี้ย')
  // Decomposed marks (as some keyboards send them) read the same.
  expect(rudeWord('đụ'.normalize('NFD') + ' má')).toBe('đụ')
})

test('ordinary fishkeeping words that look like one are left alone', () => {
  for (const clean of [
    'Mỗi tuần mình cho 5cc phân nước, 1 cc vi sinh',
    'Mở lon thức ăn mới cho các bé cá',
    'Đeo găng tay khi rửa lọc, du lịch xa thì nhờ người cho ăn',
    'Cá vàng thích ăn bobo, con chó nhà mình hay ngó bể',
    'Tai ikan menumpuk di dasar akuarium, babi hutan dan anjing laut',
    'Ikan puyu dan sepat, tangki 50 liter',
    'Dickson bought a shitake log for his paludarium',
    'ค้นในกูเกิลแล้ว ปลาหางนกยูงกินหีบอาหารหมด',
    'ตัวเงินตัวทองกินปลาในบ่อ',
    'เมื่อคืนเหี้ยลงบ่อกินปลาหมด ปิรันย่าเป็นนักล่าที่โหดเหี้ยม',
    'แม่งานจัดประกวดปลากัด ตัวแม่งามมาก ธรรมชาติหมายถึงน้ำนิ่ง สัดส่วนน้ำกับเกลือ',
    'Kệ bể gỗ óc chó, hạt óc chó, phân súc vật bón ao',
    'dm shop nhé, bể 8 dm, thay 30% la du ma, mẹ mày cho cá ăn giúp được không?',
    'A glass lid retards evaporation; khử Cl trước khi thay nước, 5 ml phân',
    'Banci penduduk, ikan keli, pukis dan pukat, mahoni, bunga kemboja',
    'Shop đồ chó mèo, mấy con ngu ngơ quá, paku keling untuk rak, bunga sundal malam tepi kolam',
    'เต่ากระดองนิ่ม ลูกบอลกระดอน ปลามังกรหน้าถมึงทึง ดอกทองกวาวริมบ่อ ไอ้ห่านตัวนั้น ตัวแม่งดอาหาร',
    'เมื่อคืนเหี้ยลงบ่อกินปลา มึงเปลี่ยนน้ำยัง ปลาน้ำเชี่ยว เชี่ยวชาญ เชี่ยงไฮ้',
    'shop ở VL, ship nội thành vl, ae VL có ai bán, VL lọc gồm sứ',
    'cmn mau tanya, ikan ini makan apa? sewa bego buat gali kolam, CB arowana',
    'ตัวพ่องดอาหารตอนอมไข่ ไอ้หีบใบนี้ เหี้ยลงบ่อ',
    'Cá là loài súc sinh, phóng sinh cá',
    'shop ở thành phố VL, giao về VL, TP.VL, o vl, tai vl, tinh vl',
    'Besi keling untuk rak, taik ikan menumpuk',
    'ตัวพ่องดเปลี่ยนถ่ายน้ำ ตัวแม่งดให้อาหาร ตัวแม่งดน้ำ',
    'ไอ้สัตว์น้ำตัวนี้ ไอ้สัดส่วนน้ำ อีดอกบัวในบ่อ ไอ้เชี่ยวชาญ',
    'Throw the fag end away from the pond',
    'Tặng kèm VLL, VLL nên dùng sứ; shop bán đồ chó cảnh',
    'Ass. Wr. Wb. mau tanya gan, Ass wr wb ikan cupang saya, piss bro, salam piss',
    'ปลาในแควย่อย แควยาว ไอ้สัตว์ประหลาดตัวนี้ ไอ้สัตว์เลี้ยง ตัวแม่งงๆ',
    'The ball is full of moss in the glass tank, kiss the boss',
    'VL có shop nào bán cá dĩa không, từ VL, dân VL, Mình người VL, bên VL, khách VL, anh em VL',
    'Shop bán đồ chó, mèo, cá cảnh; đồ chó/mèo giá rẻ; phụ kiện đồ chó và mèo; con chó má mình mới mua',
    'geser ke knn dikit, bahagian knn tangki, buto ijo, harga bapok naik, ada kampret di atap, ikan bisa celaka, Celakanya pompa saya mati, Waduh celaka filter mati, membawa celaka, klik buttonnya, so hai semua, mata bengap',
    'shop VL có cá không, cá kiểng VL đẹp, đi VL mua cá, từ VL lên, TP. VL, VL sứ, bán đồ chó, shop đồ chó, mua đồ chó ở đâu, từ vl lên, đi vl mua cá, dân vl, anh em vl, ca bi so hai, 1 cc vi sinh',
    'นกตุ๊ดตู่ แกงกะหรี่ ตัวพ่องงมาก ตัวแม่งง ตัวแม่งงงไป ไอ้สัตว์ตัวนี้กินอะไร ไอ้สัตว์ป่าลงบ่อ',
    'Shiitake on the good wood, the boss said to pass the glass, assess the class, Maaf saat ini, Allah, Assam tea, butt joint, my betta is keeling over, use a peeler on the zucchini',
    'các chất như Cl, NH3, làm sao biết Cl bay hết chưa, ปลาเสือกินลูกน้ำไหม เลี้ยงปลาเสือกับปลาทอง ปลาเสือก็กิน ปลาเสือกัดกัน ปลาเสือกระโดด ขอถือวิสาสะถามหน่อย ขออาสาส่งปลาให้ ปลาทรงสวยได้ส่วนสัด ตัวเมียติดสัด ไอ้หมายเลขนี้',
    'nanya cmn, satu ekor cmn, harga segini cmn?, con chó đẻ mấy con, ตัวได้สัด ไม่ได้สัด แถวบ้านมีเหี้ยมาก ตัวเหี้ยมากินปลา ซวยจริงปลาตาย',
    'thay vl sứ, châm vl, bổ sung vl, filter di pojok knn, samping knn tangki, sblh knn, ikan anjing laut, pemilik anjing, ปลาถูกเหี้ยกินหมด เมื่อคืนเหี้ยมากินปลาในบ่อ พอเหี้ยมาก็หนีหมด เหี้ยมากลับมาอีก กุ้งเสือกลัวแสง',
    'túi sml, size: sml, còn sml, mùi như cl, làm cl cho hồ, nối vcc, chân vcc, vl có shop nào, bangke ikan mengambang, เจอเหี้ยเลย',
    'size SML, size sml, châm phân vl, 5 ml phân mỗi tuần, ตัวเหี้ยเลยลงบ่อ เหี้ยเลยลงมากินปลา มีเหี้ยเลย กระเสือกกระสน ปลาเป็นสัด สาส์นจากร้าน สาสมแล้ว ตายห่างจากบ่อ',
    'shop vl có cá dĩa không, cá vl, pam di knn, belah knn, beli keling untuk rak, cmn mau tanya, สัดส่วนน้ำดี เป็นสัดส่วน ดีสัดส่วน สาสน์จากร้าน ช่างหีบไม้ คุณแม่งง ตัวแม่งง',
    'ตัวแม่งอแงไม่กิน ตัวพ่องอแง ตัวแม่งวงช้าง ไอน้ำ ไอเดีย ไอซ์ ปลาไอห่างๆ ซื้ออีกกะหรี่ แถวบ้านมีเหี้ยมาก',
    'hạt thức ăn như cứt chuột, uốn éo, éo le, thằng chó nhà mình, đồ chó cưng, người vl, bên vl, khách vl, nasib sial, pussy willow by the pond',
    'ปลาช่อนตัวนี้โคตรเหี้ยม ต้นแม่งอกไหลใหม่ ตัวแม่งอนไม่ยอมกิน ตัวแม่งอตัว ตัวพ่องอตัว ตัวแม่งง ไม่ยอมวางไข่ ปลาตัวแม่งง',
    'châm đl vl mỗi tuần, đl, vl, đl/vl, thiếu vl nên vàng lá, dư vl, châm thêm vl, dùng vl gì, cho vl vào ngăn lọc, rửa vl, 50.000 đ có ship',
    'có vl, còn vl, mua vl, vl này tốt, có sml, đủ sml, ikan keling, depan knn, belakang knn, แถวบ้านไม่มีเหี้ยเลย ใบเหี่ยว หีบเพลง ตัวนี้เหี้ยจริงหรือเปล่า',
    // Read off real forum posts and every fish and plant name in the handbook.
    'bọt khí và shit trong hồ, nó ăn shit của nhau, vừa ra shit, shit của cá, không có shit cá, 3 cục shit rùa, 1 miếng "shit" nào, hút hết shit',
    'tương đương như CC, support như CC, buồi chiều vui vẻ, buồi off rất vui, éo èo, KML, SML và Indomalau, cá SML, 1 dòng cmm thôi',
    'ปั๊มรุ่น VL-400 ดีไหม, đồ VL ngu, thằng Cl ngu',
    'Ảnh: Dick Evans from Bristol, photo by Dick Brown, บัวเสือกลัวแสง บัวเสือกระโดด',
    'tahi kucing masuk kolam, taik kucing masuk akuarium, takut banget anjing, kenapa sih anjing saya, sakit parah anjing saya',
    'ปลาถูกเหี้ยมากินหมด อาหารของเหี้ย รอยเท้าของเหี้ย เสาสูง เสาสแตนเลส ตัวเสือกระโดด ลายเสือกลัวแสง พ่อค้าเหี้ยมโหด',
  ]) expect([clean, rudeWord(clean)]).toEqual([clean, undefined])
})
