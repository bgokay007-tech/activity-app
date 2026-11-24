/** Fitness & Spor Salonu — hareket kataloğu + bilimsel çalışmalar.
 *  Görseller: free-exercise-db (CC / açık lisans, GitHub raw).
 *  Çalışmalar: PubMed / PMC / WHO / ACSM / NSCA / BJSM kaynakları (yıl + kaynak adı). */

const L = (en, tr, ru, de) => ({ en, tr, ru, de });

const IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';

function img(path) {
    return `${IMG_BASE}/${path}`;
}

function pick(obj, lang) {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    return obj[lang] || obj.en || obj.tr || '';
}

/** Kategori + egzersiz listesi (salonlarda yaygın hareketler). */
export const FITNESS_EXERCISE_GROUPS = [
    {
        id: 'chest',
        label: L('Chest', 'Göğüs', 'Грудь', 'Brust'),
        exercises: [
            { id: 'bench', name: L('Barbell Bench Press', 'Barbell Bench Press', 'Жим штанги лёжа', 'Langhantel-Bankdrücken'), image: img('Barbell_Bench_Press_-_Medium_Grip/0.jpg'), muscles: L('Pecs, triceps, front delts', 'Göğüs, triceps, ön omuz', 'Грудь, трицепс, передние дельты', 'Brust, Trizeps, vordere Schulter') },
            { id: 'incline_bench', name: L('Incline Bench Press', 'Eğimli Bench Press', 'Жим на наклонной', 'Schrägbankdrücken'), image: img('Barbell_Incline_Bench_Press_-_Medium_Grip/0.jpg'), muscles: L('Upper pecs', 'Üst göğüs', 'Верх груди', 'Obere Brust') },
            { id: 'decline_bench', name: L('Decline Bench Press', 'Decline Bench Press', 'Жим с отрицательным наклоном', 'Negativbankdrücken'), image: img('Decline_Barbell_Bench_Press/0.jpg'), muscles: L('Lower pecs', 'Alt göğüs', 'Низ груди', 'Untere Brust') },
            { id: 'db_bench', name: L('Dumbbell Bench Press', 'Dumbbell Bench Press', 'Жим гантелей лёжа', 'Kurzhantel-Bankdrücken'), image: img('Dumbbell_Bench_Press/0.jpg'), muscles: L('Pecs, stabilizers', 'Göğüs, dengeleyiciler', 'Грудь, стабилизаторы', 'Brust, Stabilisatoren') },
            { id: 'flyes', name: L('Dumbbell Flyes', 'Dumbbell Fly', 'Разведение гантелей', 'Kurzhantel-Flys'), image: img('Dumbbell_Flyes/0.jpg'), muscles: L('Pecs (stretch)', 'Göğüs (esneme)', 'Грудь (растяжение)', 'Brust (Dehnung)') },
            { id: 'crossover', name: L('Cable Crossover', 'Cable Crossover', 'Кроссовер', 'Kabel-Crossover'), image: img('Cable_Crossover/0.jpg'), muscles: L('Pecs', 'Göğüs', 'Грудь', 'Brust') },
            { id: 'pushups', name: L('Push-Ups', 'Şınav', 'Отжимания', 'Liegestütze'), image: img('Pushups/0.jpg'), muscles: L('Pecs, triceps, core', 'Göğüs, triceps, kor', 'Грудь, трицепс, кор', 'Brust, Trizeps, Rumpf') },
            { id: 'chest_dips', name: L('Chest Dips', 'Göğüs Dip', 'Отжимания на брусьях (грудь)', 'Dips (Brust)'), image: img('Dips_-_Chest_Version/0.jpg'), muscles: L('Lower pecs, triceps', 'Alt göğüs, triceps', 'Низ груди, трицепс', 'Untere Brust, Trizeps') },
        ],
    },
    {
        id: 'back',
        label: L('Back', 'Sırt', 'Спина', 'Rücken'),
        exercises: [
            { id: 'deadlift', name: L('Barbell Deadlift', 'Barbell Deadlift', 'Становая тяга', 'Kreuzheben'), image: img('Barbell_Deadlift/0.jpg'), muscles: L('Posterior chain, back', 'Arka zincir, sırt', 'Задняя цепь, спина', 'Hinterkette, Rücken') },
            { id: 'sumo_dl', name: L('Sumo Deadlift', 'Sumo Deadlift', 'Становая сумо', 'Sumo-Kreuzheben'), image: img('Sumo_Deadlift/0.jpg'), muscles: L('Glutes, adductors, back', 'Kalça, iç bacak, sırt', 'Ягодицы, приводящие, спина', 'Gesäß, Adduktoren, Rücken') },
            { id: 'rdl', name: L('Romanian Deadlift', 'Romanian Deadlift', 'Румынская тяга', 'Rumänisches Kreuzheben'), image: img('Romanian_Deadlift/0.jpg'), muscles: L('Hamstrings, glutes', 'Hamstring, kalça', 'Бицепс бедра, ягодицы', 'Beinbeuger, Gesäß') },
            { id: 'barbell_row', name: L('Bent-Over Barbell Row', 'Barbell Row', 'Тяга штанги в наклоне', 'Langhantelrudern'), image: img('Bent_Over_Barbell_Row/0.jpg'), muscles: L('Lats, mid-back', 'Lat, orta sırt', 'Широчайшие, середина спины', 'Latissimus, mittlerer Rücken') },
            { id: 'db_row', name: L('One-Arm Dumbbell Row', 'Tek Kol Dumbbell Row', 'Тяга гантели одной рукой', 'Einarmiges Kurzhantelrudern'), image: img('One-Arm_Dumbbell_Row/0.jpg'), muscles: L('Lats, rhomboids', 'Lat, romboid', 'Широчайшие, ромбовидные', 'Latissimus, Rautenmuskel') },
            { id: 'pulldown', name: L('Wide-Grip Lat Pulldown', 'Geniş Tutuş Lat Pulldown', 'Тяга верхнего блока', 'Latzug breit'), image: img('Wide-Grip_Lat_Pulldown/0.jpg'), muscles: L('Lats', 'Latissimus', 'Широчайшие', 'Latissimus') },
            { id: 'pullups', name: L('Pull-Ups', 'Barfiks (Pull-Up)', 'Подтягивания', 'Klimmzüge'), image: img('Pullups/0.jpg'), muscles: L('Lats, biceps', 'Lat, biceps', 'Широчайшие, бицепс', 'Latissimus, Bizeps') },
            { id: 'chinups', name: L('Chin-Ups', 'Barfiks (Chin-Up)', 'Подтягивания обратным хватом', 'Klimmzüge Untergriff'), image: img('Chin-Up/0.jpg'), muscles: L('Lats, biceps', 'Lat, biceps', 'Широчайшие, бицепс', 'Latissimus, Bizeps') },
            { id: 'seated_row', name: L('Seated Cable Rows', 'Oturarak Kablo Row', 'Тяга горизонтального блока', 'Sitzendes Kabelrudern'), image: img('Seated_Cable_Rows/0.jpg'), muscles: L('Mid-back, lats', 'Orta sırt, lat', 'Середина спины, широчайшие', 'Mittlerer Rücken, Lat') },
            { id: 'tbar', name: L('T-Bar Row', 'T-Bar Row', 'Тяга Т-грифа', 'T-Bar-Rudern'), image: img('T-Bar_Row_with_Handle/0.jpg'), muscles: L('Back thickness', 'Sırt kalınlığı', 'Толщина спины', 'Rücken-Dicke') },
            { id: 'face_pull', name: L('Face Pull', 'Face Pull', 'Тяга к лицу', 'Face Pull'), image: img('Face_Pull/0.jpg'), muscles: L('Rear delts, rotator cuff', 'Arka omuz, rotator', 'Задние дельты, ротаторная манжета', 'Hintere Schulter, Rotatorenmanschette') },
            { id: 'hyper', name: L('Back Extensions', 'Hiperekstansiyon', 'Гиперэкстензия', 'Rückenstrecker'), image: img('Hyperextensions_Back_Extensions/0.jpg'), muscles: L('Erectors, glutes', 'Bel ekstansörleri, kalça', 'Разгибатели спины, ягодицы', 'Rückenstrecker, Gesäß') },
        ],
    },
    {
        id: 'shoulders',
        label: L('Shoulders', 'Omuz', 'Плечи', 'Schultern'),
        exercises: [
            { id: 'ohp', name: L('Standing Military Press', 'Military Press', 'Армейский жим стоя', 'Military Press'), image: img('Standing_Military_Press/0.jpg'), muscles: L('Delts, triceps', 'Omuz, triceps', 'Дельты, трицепс', 'Schultern, Trizeps') },
            { id: 'seated_ohp', name: L('Seated Barbell Military Press', 'Oturarak Military Press', 'Армейский жим сидя', 'Military Press sitzend'), image: img('Seated_Barbell_Military_Press/0.jpg'), muscles: L('Delts', 'Omuz', 'Дельты', 'Schultern') },
            { id: 'arnold', name: L('Arnold Press', 'Arnold Press', 'Жим Арнольда', 'Arnold-Presse'), image: img('Arnold_Dumbbell_Press/0.jpg'), muscles: L('All delt heads', 'Tüm omuz başları', 'Все пучки дельт', 'Alle Schulterköpfe') },
            { id: 'lateral', name: L('Side Lateral Raise', 'Yan Raise', 'Разведение в стороны', 'Seitheben'), image: img('Side_Lateral_Raise/0.jpg'), muscles: L('Side delts', 'Yan omuz', 'Средние дельты', 'Seitliche Schulter') },
            { id: 'front_raise', name: L('Front Dumbbell Raise', 'Ön Raise', 'Подъём гантелей вперёд', 'Frontheben'), image: img('Front_Dumbbell_Raise/0.jpg'), muscles: L('Front delts', 'Ön omuz', 'Передние дельты', 'Vordere Schulter') },
            { id: 'rear_fly', name: L('Cable Rear Delt Fly', 'Arka Omuz Fly', 'Разведение на задние дельты', 'Kabel Reverse Fly'), image: img('Cable_Rear_Delt_Fly/0.jpg'), muscles: L('Rear delts', 'Arka omuz', 'Задние дельты', 'Hintere Schulter') },
            { id: 'upright', name: L('Dumbbell Upright Row', 'Upright Row', 'Тяга к подбородку', 'Aufrechtes Rudern'), image: img('Standing_Dumbbell_Upright_Row/0.jpg'), muscles: L('Delts, traps', 'Omuz, trapezius', 'Дельты, трапеции', 'Schultern, Trapez') },
            { id: 'shrug', name: L('Barbell Shrug', 'Shrug', 'Шраги', 'Shrugs'), image: img('Barbell_Shrug/0.jpg'), muscles: L('Traps', 'Trapezius', 'Трапеции', 'Trapezmuskel') },
        ],
    },
    {
        id: 'legs',
        label: L('Legs & Glutes', 'Bacak & Kalça', 'Ноги и ягодицы', 'Beine & Gesäß'),
        exercises: [
            { id: 'squat', name: L('Barbell Back Squat', 'Barbell Squat', 'Приседания со штангой', 'Kniebeuge'), image: img('Barbell_Squat/0.jpg'), muscles: L('Quads, glutes', 'Quadriceps, kalça', 'Квадрицепс, ягодицы', 'Quadrizeps, Gesäß') },
            { id: 'front_squat', name: L('Front Barbell Squat', 'Front Squat', 'Фронтальные приседания', 'Frontkniebeuge'), image: img('Front_Barbell_Squat/0.jpg'), muscles: L('Quads, core', 'Quadriceps, kor', 'Квадрицепс, кор', 'Quadrizeps, Rumpf') },
            { id: 'goblet', name: L('Goblet Squat', 'Goblet Squat', 'Кубковые приседания', 'Goblet-Kniebeuge'), image: img('Goblet_Squat/0.jpg'), muscles: L('Quads, glutes', 'Quadriceps, kalça', 'Квадрицепс, ягодицы', 'Quadrizeps, Gesäß') },
            { id: 'leg_press', name: L('Leg Press', 'Leg Press', 'Жим ногами', 'Beinpresse'), image: img('Leg_Press/0.jpg'), muscles: L('Quads, glutes', 'Quadriceps, kalça', 'Квадрицепс, ягодицы', 'Quadrizeps, Gesäß') },
            { id: 'hack', name: L('Hack Squat', 'Hack Squat', 'Гакк-приседания', 'Hackenschmidt-Kniebeuge'), image: img('Hack_Squat/0.jpg'), muscles: L('Quads', 'Quadriceps', 'Квадрицепс', 'Quadrizeps') },
            { id: 'lunge', name: L('Barbell Lunge', 'Lunge (Hamle)', 'Выпады со штангой', 'Ausfallschritte'), image: img('Barbell_Lunge/0.jpg'), muscles: L('Quads, glutes', 'Quadriceps, kalça', 'Квадрицепс, ягодицы', 'Quadrizeps, Gesäß') },
            { id: 'split', name: L('Split Squats', 'Split Squat', 'Сплит-приседания', 'Split Squats'), image: img('Split_Squats/0.jpg'), muscles: L('Quads, glutes, balance', 'Quadriceps, kalça, denge', 'Квадрицепс, ягодицы, баланс', 'Quadrizeps, Gesäß, Balance') },
            { id: 'leg_ext', name: L('Leg Extensions', 'Leg Extension', 'Разгибание ног', 'Beinstrecker'), image: img('Leg_Extensions/0.jpg'), muscles: L('Quads', 'Quadriceps', 'Квадрицепс', 'Quadrizeps') },
            { id: 'leg_curl', name: L('Lying Leg Curls', 'Lying Leg Curl', 'Сгибание ног лёжа', 'Beinbeuger liegend'), image: img('Lying_Leg_Curls/0.jpg'), muscles: L('Hamstrings', 'Hamstring', 'Бицепс бедра', 'Beinbeuger') },
            { id: 'seated_curl', name: L('Seated Leg Curl', 'Seated Leg Curl', 'Сгибание ног сидя', 'Beinbeuger sitzend'), image: img('Seated_Leg_Curl/0.jpg'), muscles: L('Hamstrings', 'Hamstring', 'Бицепс бедра', 'Beinbeuger') },
            { id: 'hip_thrust', name: L('Barbell Hip Thrust', 'Hip Thrust', 'Ягодичный мост со штангой', 'Hip Thrust'), image: img('Barbell_Hip_Thrust/0.jpg'), muscles: L('Glutes', 'Kalça', 'Ягодицы', 'Gesäß') },
            { id: 'calf', name: L('Standing Calf Raises', 'Standing Calf Raise', 'Подъёмы на носки стоя', 'Wadenheben stehend'), image: img('Standing_Calf_Raises/0.jpg'), muscles: L('Calves', 'Baldır', 'Икры', 'Waden') },
            { id: 'good_morning', name: L('Good Morning', 'Good Morning', 'Гудморнинг', 'Good Morning'), image: img('Good_Morning/0.jpg'), muscles: L('Hamstrings, erectors', 'Hamstring, bel', 'Бицепс бедра, разгибатели', 'Beinbeuger, Rückenstrecker') },
        ],
    },
    {
        id: 'arms',
        label: L('Arms', 'Kollar', 'Руки', 'Arme'),
        exercises: [
            { id: 'bb_curl', name: L('Barbell Curl', 'Barbell Curl', 'Подъём штанги на бицепс', 'Langhantel-Curls'), image: img('Barbell_Curl/0.jpg'), muscles: L('Biceps', 'Biceps', 'Бицепс', 'Bizeps') },
            { id: 'hammer', name: L('Hammer Curl', 'Hammer Curl', 'Молотковые сгибания', 'Hammer-Curls'), image: img('Alternate_Hammer_Curl/0.jpg'), muscles: L('Biceps, brachialis', 'Biceps, brakialis', 'Бицепс, брахиалис', 'Bizeps, Brachialis') },
            { id: 'preacher', name: L('Preacher Curl', 'Preacher Curl', 'Сгибания на скамье Скотта', 'Scott-Curls'), image: img('One_Arm_Dumbbell_Preacher_Curl/0.jpg'), muscles: L('Biceps peak', 'Biceps zirvesi', 'Пик бицепса', 'Bizeps-Peak') },
            { id: 'conc', name: L('Concentration Curl', 'Concentration Curl', 'Концентрированные сгибания', 'Konzentrations-Curls'), image: img('Concentration_Curls/0.jpg'), muscles: L('Biceps', 'Biceps', 'Бицепс', 'Bizeps') },
            { id: 'pushdown', name: L('Triceps Pushdown', 'Triceps Pushdown', 'Разгибание на блоке', 'Trizeps-Pushdown'), image: img('Triceps_Pushdown/0.jpg'), muscles: L('Triceps', 'Triceps', 'Трицепс', 'Trizeps') },
            { id: 'rope_pd', name: L('Rope Triceps Pushdown', 'İp Pushdown', 'Разгибание канатом', 'Seil-Pushdown'), image: img('Triceps_Pushdown_-_Rope_Attachment/0.jpg'), muscles: L('Triceps (lateral head)', 'Triceps (yan baş)', 'Трицепс (латеральная головка)', 'Trizeps (seitlicher Kopf)') },
            { id: 'skull', name: L('EZ-Bar Skullcrusher', 'Skull Crusher', 'Французский жим', 'Skull Crusher'), image: img('EZ-Bar_Skullcrusher/0.jpg'), muscles: L('Triceps long head', 'Triceps uzun baş', 'Длинная головка трицепса', 'Langer Trizepskopf') },
            { id: 'oh_tri', name: L('Overhead Triceps Extension', 'Overhead Triceps', 'Французский жим стоя/сидя', 'Überkopf-Trizeps'), image: img('Cable_Rope_Overhead_Triceps_Extension/0.jpg'), muscles: L('Triceps long head', 'Triceps uzun baş', 'Длинная головка трицепса', 'Langer Trizepskopf') },
            { id: 'tri_dip', name: L('Triceps Dips', 'Triceps Dip', 'Отжимания на брусьях (трицепс)', 'Dips (Trizeps)'), image: img('Dips_-_Triceps_Version/0.jpg'), muscles: L('Triceps, chest', 'Triceps, göğüs', 'Трицепс, грудь', 'Trizeps, Brust') },
            { id: 'cg_bench', name: L('Close-Grip Bench Press', 'Close-Grip Bench', 'Жим узким хватом', 'Enges Bankdrücken'), image: img('Smith_Machine_Close-Grip_Bench_Press/0.jpg'), muscles: L('Triceps, pecs', 'Triceps, göğüs', 'Трицепс, грудь', 'Trizeps, Brust') },
        ],
    },
    {
        id: 'core',
        label: L('Core', 'Karın / Kor', 'Кор / пресс', 'Rumpf / Core'),
        exercises: [
            { id: 'plank', name: L('Plank', 'Plank', 'Планка', 'Plank'), image: img('Plank/0.jpg'), muscles: L('Deep core', 'Derin kor', 'Глубокий кор', 'Tiefe Rumpfmuskulatur') },
            { id: 'crunch', name: L('Cable Crunch', 'Cable Crunch', 'Скручивания на блоке', 'Kabel-Crunch'), image: img('Cable_Crunch/0.jpg'), muscles: L('Abs', 'Karın', 'Пресс', 'Bauch') },
            { id: 'hanging', name: L('Hanging Leg Raise', 'Asılı Leg Raise', 'Подъём ног в висе', 'Hängendes Beinheben'), image: img('Hanging_Leg_Raise/0.jpg'), muscles: L('Lower abs, hip flexors', 'Alt karın, kalça fleksörleri', 'Низ пресса, сгибатели бедра', 'Unterer Bauch, Hüftbeuger') },
            { id: 'russian', name: L('Russian Twist', 'Russian Twist', 'Русские скручивания', 'Russian Twist'), image: img('Russian_Twist/0.jpg'), muscles: L('Obliques', 'Yan karın', 'Косые мышцы', 'Schräge Bauchmuskeln') },
            { id: 'ab_roll', name: L('Ab Roller', 'Ab Wheel', 'Ролик для пресса', 'Ab-Roller'), image: img('Ab_Roller/0.jpg'), muscles: L('Abs, anti-extension', 'Karın, anti-ekstansiyon', 'Пресс, антиэкстензия', 'Bauch, Anti-Extension') },
            { id: 'woodchop', name: L('Cable Wood Chop', 'Cable Woodchop', 'Рубка дров на блоке', 'Kabel-Woodchop'), image: img('Standing_Cable_Wood_Chop/0.jpg'), muscles: L('Obliques, rotation', 'Yan karın, rotasyon', 'Косые, ротация', 'Schräge, Rotation') },
            { id: 'air_bike', name: L('Air Bike (Bicycle Crunch)', 'Air Bike', 'Велосипед', 'Air Bike'), image: img('Air_Bike/0.jpg'), muscles: L('Abs, obliques', 'Karın, yan karın', 'Пресс, косые', 'Bauch, Schräge') },
            { id: 'leg_raise', name: L('Lying Leg Raises', 'Yatarak Leg Raise', 'Подъём ног лёжа', 'Beinheben liegend'), image: img('Hanging_Leg_Raise/0.jpg'), muscles: L('Lower abs', 'Alt karın', 'Низ пресса', 'Unterer Bauch') },
        ],
    },
    {
        id: 'cardio',
        label: L('Cardio machines', 'Kardiyo makineleri', 'Кардио-тренажёры', 'Cardio-Geräte'),
        exercises: [
            { id: 'treadmill', name: L('Treadmill Run / Walk', 'Koşu bandı', 'Беговая дорожка', 'Laufband'), image: img('Running_Treadmill/0.jpg'), muscles: L('Cardio, legs', 'Kardiyo, bacaklar', 'Кардио, ноги', 'Cardio, Beine') },
            { id: 'bike', name: L('Stationary Bike', 'Bisiklet', 'Велотренажёр', 'Fahrradergometer'), image: img('Bicycling_Stationary/0.jpg'), muscles: L('Cardio, quads', 'Kardiyo, quadriceps', 'Кардио, квадрицепс', 'Cardio, Quadrizeps') },
            { id: 'rower', name: L('Rowing Machine', 'Kürek makinesi', 'Гребной тренажёр', 'Rudergerät'), image: img('Rowing_Stationary/0.jpg'), muscles: L('Full-body cardio', 'Tüm vücut kardiyo', 'Кардио всего тела', 'Ganzkörper-Cardio') },
            { id: 'elliptical', name: L('Elliptical Trainer', 'Eliptik bisiklet', 'Эллиптический тренажёр', 'Crosstrainer'), image: img('Elliptical_Trainer/0.jpg'), muscles: L('Low-impact cardio', 'Düşük etkili kardiyo', 'Кардио с низкой ударной нагрузкой', 'Gelenkschonendes Cardio') },
            { id: 'stairs', name: L('Stair Climber', 'Merdiven makinesi', 'Степпер / лестница', 'Treppensteiger'), image: img('Stairmaster/0.jpg'), muscles: L('Glutes, cardio', 'Kalça, kardiyo', 'Ягодицы, кардио', 'Gesäß, Cardio') },
            { id: 'climbers', name: L('Mountain Climbers', 'Mountain Climber', 'Альпинист', 'Mountain Climbers'), image: img('Mountain_Climbers/0.jpg'), muscles: L('Cardio, core', 'Kardiyo, kor', 'Кардио, кор', 'Cardio, Rumpf') },
            { id: 'kb_swing', name: L('Kettlebell Swing', 'Kettlebell Swing', 'Махи гирей', 'Kettlebell-Swing'), image: img('One-Arm_Kettlebell_Swings/0.jpg'), muscles: L('Posterior chain, power', 'Arka zincir, güç', 'Задняя цепь, мощность', 'Hinterkette, Power') },
            { id: 'farmers', name: L("Farmer's Walk", 'Farmer Walk', 'Прогулка фермера', 'Farmer’s Walk'), image: img('Farmers_Walk/0.jpg'), muscles: L('Grip, traps, core', 'Kavrama, trapezius, kor', 'Хват, трапеции, кор', 'Griffkraft, Trapez, Rumpf') },
            { id: 'clean_press', name: L('Clean and Press', 'Clean & Press', 'Подъём на грудь и жим', 'Umsetzen und Stoßen/Drücken'), image: img('Clean_and_Press/0.jpg'), muscles: L('Full body power', 'Tüm vücut güç', 'Мощность всего тела', 'Ganzkörper-Kraft') },
        ],
    },
];

/** Bilimsel çalışmalar — başlık tıklanınca detay; kaynak adı + yıl + URL. */
export const FITNESS_STUDIES = [
    {
        id: 'who2020',
        year: 2020,
        source: 'Br J Sports Med / WHO',
        authors: 'Bull et al.',
        url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7719906/',
        title: L(
            'WHO 2020 guidelines on physical activity and sedentary behaviour',
            'WHO 2020 fiziksel aktivite ve sedanter davranış kılavuzu',
            'Рекомендации ВОЗ 2020 по физической активности и малоподвижному поведению',
            'WHO-Leitlinien 2020 zu Bewegung und Sitzverhalten'
        ),
        detail: L(
            'Adults should do 150–300 min/week of moderate-intensity or 75–150 min/week of vigorous aerobic activity (or an equivalent mix), plus muscle-strengthening on ≥2 days/week. The update also emphasizes reducing sedentary time. Benefits cover mortality, cardiometabolic disease, mental health, sleep and cognition. These public-health targets are the baseline many gym programs aim to meet or exceed.',
            'Yetişkinler haftada 150–300 dk orta şiddette veya 75–150 dk yüksek şiddette aerobik aktivite (veya eşdeğer karışım) yapmalı; ayrıca haftada ≥2 gün kas güçlendirme eklemelidir. Güncelleme sedanter süreyi azaltmayı da vurgular. Faydalar ölüm riski, kardiyometabolik hastalık, ruh sağlığı, uyku ve bilişi kapsar. Birçok salon programı bu halk sağlığı hedefini karşılamayı veya aşmayı hedefler.',
            'Взрослым рекомендуется 150–300 мин/нед умеренной или 75–150 мин/нед интенсивной аэробной нагрузки (или эквивалент), плюс силовые занятия ≥2 дней/нед. Обновление также подчёркивает сокращение сидячего времени. Польза — смертность, кардиометаболизм, психическое здоровье, сон и когниции. Многие зальные программы стремятся достичь или превысить эти цели.',
            'Erwachsene sollen 150–300 Min./Woche moderate oder 75–150 Min./Woche intensive Ausdaueraktivität (oder eine Kombination) plus ≥2 Tage/Woche Muskelkräftigung machen. Die Aktualisierung betont auch weniger Sitzen. Nutzen betreffen Sterblichkeit, Stoffwechsel, mentale Gesundheit, Schlaf und Kognition. Viele Studiopläne zielen auf diese Public-Health-Ziele ab.'
        ),
    },
    {
        id: 'acsm2009',
        year: 2009,
        source: 'Med Sci Sports Exerc (ACSM Position Stand)',
        authors: 'American College of Sports Medicine',
        url: 'https://pubmed.ncbi.nlm.nih.gov/19204579/',
        title: L(
            'ACSM Position Stand: Progression models in resistance training for healthy adults',
            'ACSM Pozisyon Bildirisi: Sağlıklı yetişkinlerde direnç antrenmanı ilerleme modelleri',
            'Позиционный документ ACSM: модели прогрессии силовых тренировок',
            'ACSM-Position Stand: Progressionsmodelle im Krafttraining'
        ),
        detail: L(
            'Classic evidence-based prescription for healthy adults: use both concentric and eccentric actions; prioritize multi-joint before single-joint; novices often start ~8–12 RM; advanced trainees use wider loading (including heavy 1–6 RM) with periodization. Frequency guidance is roughly 2–3 days/week for novices/intermediates and higher for advanced. Hypertrophy emphasis historically sat in the ~6–12 RM zone with moderate rests; multiple sets are preferred for maximizing size. Still widely cited as the institutional backbone of gym programming.',
            'Sağlıklı yetişkinler için klasik kanıta dayalı reçete: hem konsantrik hem eksantrik kasılma; çok eklemli hareketler tek eklemlilerden önce; yeni başlayanlar genelde ~8–12 RM; ileri düzeyde daha geniş yük aralığı (1–6 RM dahil) ve periyodizasyon. Sıklık yeni/orta düzeyde kabaca haftada 2–3 gün, ileri düzeyde daha fazla. Hipertrofi vurgusu tarihsel olarak ~6–12 RM ve orta dinlenmelerdedir; boyut için çok set tercih edilir. Salon programlamasının kurumsal omurgası olarak hâlâ çok anılır.',
            'Классическая доказательная схема для здоровых взрослых: концентрика и эксцентрика; сначала многосуставные; новички часто ~8–12 ПМ; продвинутым — более широкий диапазон (включая 1–6 ПМ) и периодизация. Частота примерно 2–3 дня/нед для новичков/среднего уровня. Гипертрофия традиционно в зоне ~6–12 ПМ с умеренным отдыхом; для объёма предпочтительны несколько подходов. До сих пор — институциональная основа зальных программ.',
            'Klassische evidenzbasierte Vorgabe für Gesunde: konzentrisch und exzentrisch; Mehrgelenk vor Eingelenk; Einsteiger oft ~8–12 RM; Fortgeschrittene breitere Lasten (inkl. 1–6 RM) mit Periodisierung. Frequenz grob 2–3 Tage/Woche für Einsteiger/Mittelstufe. Hypertrophie historisch ~6–12 RM mit moderaten Pausen; Mehrfachsätze für maximale Masse. Bis heute oft die institutionelle Basis von Studioprogrammen.'
        ),
    },
    {
        id: 'acsm2025rt',
        year: 2025,
        source: 'Med Sci Sports Exerc (ACSM overview of reviews)',
        authors: 'ACSM / overview of reviews team',
        url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/',
        title: L(
            'ACSM overview: Resistance training prescription for muscle function, hypertrophy and performance',
            'ACSM özeti: Kas fonksiyonu, hipertrofi ve performans için direnç antrenmanı reçetesi',
            'Обзор ACSM: назначение силовых тренировок для функции, гипертрофии и производительности',
            'ACSM-Überblick: Krafttrainingsvorgaben für Funktion, Hypertrophie und Leistung'
        ),
        detail: L(
            'Updates the 2009 Position Stand by synthesizing 137 systematic reviews (>30,000 participants). Versus no exercise, RT improves strength, size, power, endurance, gait and balance. Few prescription variables matter consistently: heavier loads (≥~80% 1RM), full ROM, 2–3 sets, training earlier in the session and ≥2 sessions/week favor strength; hypertrophy is helped by higher weekly volume (≥~10 sets/muscle/week) and eccentric overload; power favors moderate loads with fast concentrics. Training to failure, equipment type and many “fine” details did not consistently dominate outcomes.',
            '2009 Pozisyon Bildirisini 137 sistematik derlemeyi (>30.000 katılımcı) sentezleyerek günceller. Egzersize kıyasla RT güç, boyut, güç (power), dayanıklılık, yürüyüş ve dengeyi iyileştirir. Az sayıda reçete değişkeni tutarlı fark yaratır: daha ağır yükler (≥~%80 1RM), tam ROM, 2–3 set, seansın başında çalışma ve haftada ≥2 seans gücü destekler; hipertrofiye yüksek haftalık hacim (≥~10 set/kas/hafta) ve eksantrik yükleme yardım eder; power için orta yük + hızlı konsantrik uygundur. Failure’a gitmek, ekipman tipi ve birçok “ince” detay sonuçları tutarlı biçimde domine etmez.',
            'Обновляет стенд 2009 года синтезом 137 систематических обзоров (>30 000 участников). По сравнению с бездействием СТ улучшает силу, размер, мощность, выносливость, походку и баланс. Немногие переменные стабильно важны: более тяжёлые веса (≥~80% 1ПМ), полный ROM, 2–3 подхода, тренировка в начале сессии и ≥2 сессий/нед — для силы; гипертрофии помогает больший недельный объём (≥~10 подходов/мышца/нед) и эксцентрическая перегрузка; для мощности — умеренные веса с быстрой концентрикой. Работа до отказа и тип оборудования не доминируют стабильно.',
            'Aktualisiert den Position Stand 2009 mit 137 systematischen Reviews (>30.000 Teilnehmern). Gegenüber keiner Bewegung verbessert KT Kraft, Größe, Power, Ausdauer, Gang und Balance. Wenige Variablen zählen konsistent: schwerere Lasten (≥~80% 1RM), voller ROM, 2–3 Sätze, Training früh in der Einheit und ≥2 Einheiten/Woche für Kraft; Hypertrophie profitiert von höherem Wochenvolumen (≥~10 Sätze/Muskel/Woche) und exzentrischer Überlast; Power von mittleren Lasten mit schneller Konzentrík. Training bis zum Versagen und Gerätetyp dominieren Outcomes nicht konsistent.'
        ),
    },
    {
        id: 'schoenfeld2017load',
        year: 2017,
        source: 'J Strength Cond Res',
        authors: 'Schoenfeld, Grgic, Ogborn, Krieger',
        url: 'https://pubmed.ncbi.nlm.nih.gov/28834797/',
        title: L(
            'Strength and hypertrophy adaptations between low- vs. high-load resistance training: a meta-analysis',
            'Düşük vs yüksek yük direnç antrenmanında güç ve hipertrofi: meta-analiz',
            'Адаптации силы и гипертрофии при низкой vs высокой нагрузке: метаанализ',
            'Kraft- und Hypertrophieanpassungen bei niedriger vs. hoher Last: Metaanalyse'
        ),
        detail: L(
            'Twenty-one studies comparing ≤60% 1RM vs >60% 1RM with sets taken toward failure (≥6 weeks). 1RM strength gains favored high loads; hypertrophy was similar across loads when effort was high. Practical takeaway for the gym: you can grow muscle with lighter weights if you push close to failure, but maximal strength still wants heavy loading.',
            '≤%60 1RM ile >%60 1RM’yi, setleri failure’a yakın götüren (≥6 hafta) 21 çalışma. 1RM güç kazanımları yüksek yük lehine; hipertrofi, çaba yüksekse yükler arasında benzer. Salon pratiği: kas büyütmek için hafif ağırlık da işe yarar (failure’a yakınsanız); maksimal güç için hâlâ ağır yük gerekir.',
            '21 исследований: ≤60% 1ПМ vs >60% 1ПМ, подходы к отказу (≥6 недель). Приросты 1ПМ лучше на тяжёлых весах; гипертрофия сходна при высоком усилии. Практика: мышцу можно растить лёгкими весами почти до отказа, но максимальная сила требует тяжёлых нагрузок.',
            '21 Studien: ≤60% 1RM vs >60% 1RM, Sätze Richtung Versagen (≥6 Wochen). 1RM-Kraft zugunsten schwerer Lasten; Hypertrophie bei hohem Effort ähnlich. Praxis: Muskelwachstum auch mit leichteren Gewichten nahe am Versagen; Maximalkraft braucht weiterhin schwere Lasten.'
        ),
    },
    {
        id: 'lopez2021nma',
        year: 2021,
        source: 'Med Sci Sports Exerc (network meta-analysis)',
        authors: 'Lopez et al.',
        url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8126497/',
        title: L(
            'Resistance training load effects on hypertrophy and strength: systematic review and network meta-analysis',
            'Direnç antrenmanı yükünün hipertrofi ve güce etkisi: ağ meta-analizi',
            'Влияние нагрузки силовой тренировки на гипертрофию и силу: сетевой метаанализ',
            'Lasteneinfluss auf Hypertrophie und Kraft: Netzwerk-Metaanalyse'
        ),
        detail: L(
            'Twenty-eight studies (747 adults) of low (>15 RM), moderate (9–15 RM) and high (≤8 RM) loads to failure. Hypertrophy did not differ meaningfully by load; strength improvements were superior for high and moderate vs low load. Untrained people hypertrophied more; more sessions helped those with training history. Reinforces “load for strength, proximity-to-failure for size”.',
            'Failure’a giden düşük (>15 RM), orta (9–15 RM) ve yüksek (≤8 RM) yükleri karşılaştıran 28 çalışma (747 yetişkin). Hipertrofi yüke göre anlamlı fark göstermedi; güç artışı yüksek ve orta yükte düşük yüke üstündü. Antrenmansızlarda hipertrofi daha fazla; daha çok seans, deneyimlilerde faydalı. “Güç için yük, boyut için failure’a yakınlık” mesajını güçlendirir.',
            '28 исследований (747 взрослых): низкая (>15 ПМ), средняя (9–15) и высокая (≤8) нагрузка до отказа. Гипертрофия почти не зависела от нагрузки; сила лучше на высокой/средней vs низкой. Новички гипертрофировались сильнее; больше сессий полезно опытным. Подтверждает: нагрузка — для силы, близость к отказу — для размера.',
            '28 Studien (747 Erwachsene): niedrige (>15 RM), mittlere (9–15) und hohe (≤8 RM) Last bis Versagen. Hypertrophie unterschied sich kaum; Kraft besser bei hoher/mittlerer vs niedriger Last. Untrainierte hypertrophierten stärker; mehr Einheiten halfen Erfahrenen. Bestätigt: Last für Kraft, Nähe zum Versagen für Masse.'
        ),
    },
    {
        id: 'currier2023bjsm',
        year: 2023,
        source: 'Br J Sports Med (Bayesian network meta-analysis)',
        authors: 'Currier et al.',
        url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10579494/',
        title: L(
            'Resistance training prescription for strength and hypertrophy: Bayesian network meta-analysis',
            'Güç ve hipertrofi için direnç antrenmanı reçetesi: Bayesçi ağ meta-analizi',
            'Назначение силовых тренировок для силы и гипертрофии: байесовский сетевой метаанализ',
            'Krafttrainingsvorgabe für Kraft und Hypertrophie: Bayes’sche Netzwerk-Metaanalyse'
        ),
        detail: L(
            'Huge evidence networks (strength: 178 trials, n≈5097; hypertrophy: 119 trials, n≈3364). All RT beat no exercise. Higher-load (>80% 1RM), multi-set, thrice-weekly ranked best for strength; higher-load, multi-set, twice-weekly ranked best for hypertrophy—though many prescriptions were close. Robust threshold analysis. Clear gym message: progressive RT works; heavy + multiple sets is a high-probability recipe.',
            'Büyük kanıt ağları (güç: 178 çalışma, n≈5097; hipertrofi: 119, n≈3364). Tüm RT, egzersiz yokluğunu yendi. Güç için en üst sıra: yüksek yük (>%80 1RM), çok set, haftada 3; hipertrofi için: yüksek yük, çok set, haftada 2—birçok reçete birbirine yakındı. Eşik analizi sağlam. Salon mesajı: progresif RT işe yarar; ağır + çok set yüksek olasılıklı bir formüldür.',
            'Крупные сети доказательств (сила: 178 исследований, n≈5097; гипертрофия: 119, n≈3364). Любая СТ лучше бездействия. Лучший ранг для силы: высокая нагрузка (>80% 1ПМ), несколько подходов, 3×/нед; для гипертрофии: высокая нагрузка, несколько подходов, 2×/нед — многие схемы близки. Порог-анализ устойчив. Вывод: прогрессивная СТ работает; тяжёлое + много подходов — надёжный рецепт.',
            'Große Evidenznetzwerke (Kraft: 178 Trials, n≈5097; Hypertrophie: 119, n≈3364). Jedes KT schlägt keine Bewegung. Top-Rang Kraft: hohe Last (>80% 1RM), Mehrfachsätze, 3×/Woche; Hypertrophie: hohe Last, Mehrfachsätze, 2×/Woche — viele Vorgaben liegen nah beieinander. Schwellenanalyse robust. Studio-Fazit: progressives KT wirkt; schwer + mehrere Sätze ist ein hochwahrscheinliches Rezept.'
        ),
    },
    {
        id: 'schoenfeld2017volume',
        year: 2017,
        source: 'J Sports Sci',
        authors: 'Schoenfeld, Ogborn, Krieger',
        url: 'https://pubmed.ncbi.nlm.nih.gov/27433992/',
        title: L(
            'Dose–response of weekly resistance training volume and muscle mass: meta-analysis',
            'Haftalık direnç antrenmanı hacmi ile kas kütlesi doz-yanıt ilişkisi: meta-analiz',
            'Доза–ответ недельного объёма силовой тренировки и мышечной массы: метаанализ',
            'Dosis-Wirkungs-Beziehung von Wochenvolumen und Muskelmasse: Metaanalyse'
        ),
        detail: L(
            'Meta-regression of 15 studies / 34 treatment arms. More weekly sets linked to greater hypertrophy (≈0.37% extra size gain per additional set in continuous models). Categorical contrasts also favored higher vs lower volume (~3.9% difference). Often summarized as aiming toward ~10+ hard sets per muscle per week for serious hypertrophy, with individual recovery limits.',
            '15 çalışma / 34 kolun meta-regresyonu. Daha fazla haftalık set, daha fazla hipertrofiyle ilişkili (sürekli modellerde ek set başına ≈%0,37 ekstra boyut). Kategorik karşılaştırmalar da yüksek hacmi destekler (~%3,9 fark). Ciddi hipertrofi için sıkça kas başına haftada ~10+ zorlu set hedefi olarak özetlenir; bireysel toparlanma sınırı vardır.',
            'Метарегрессия 15 исследований / 34 ветвей. Больше недельных подходов связано с большей гипертрофией (≈0,37% доп. прироста размера на подход). Категориальные сравнения тоже в пользу большего объёма (~3,9%). Часто резюмируют как ~10+ тяжёлых подходов на мышцу в неделю для серьёзной гипертрофии с учётом восстановления.',
            'Meta-Regression aus 15 Studien / 34 Armen. Mehr Wochensätze hängen mit mehr Hypertrophie zusammen (≈0,37% Extra-Größengewinn pro zusätzlichem Satz). Kategorische Vergleiche begünstigen höheres Volumen (~3,9%). Oft als Ziel ~10+ harte Sätze/Muskel/Woche für ernsthafte Hypertrophie zusammengefasst — individuell begrenzt durch Erholung.'
        ),
    },
    {
        id: 'grgic2017rest',
        year: 2017,
        source: 'Eur J Sport Sci',
        authors: 'Grgic, Lazinica, Mikulic, Krieger, Schoenfeld',
        url: 'https://pubmed.ncbi.nlm.nih.gov/28641044/',
        title: L(
            'Short versus long inter-set rest intervals and hypertrophy: systematic review',
            'Kısa vs uzun set arası dinlenme ve hipertrofi: sistematik derleme',
            'Короткий vs длинный отдых между подходами и гипертрофия: систематический обзор',
            'Kurze vs. lange Satzpausen und Hypertrophie: systematischer Review'
        ),
        detail: L(
            'Six eligible longitudinal studies comparing ≤60 s vs >60 s rests. Both can build muscle; newer evidence in trained lifters with sensitive hypertrophy measures hints that longer rests may help by preserving volume-load. Gym translation: don’t rush compounds—~2+ minutes is a safe default; isolation work can use shorter rests if performance holds.',
            '≤60 sn ile >60 sn dinlenmeyi karşılaştıran 6 uygun boylamsal çalışma. İkisi de kas yaptırabilir; deneyimli sporcularda hassas ölçümlerle daha uzun dinlenme, hacim-yükü koruyarak avantajlı olabilir. Salon çevirisi: compound’larda acele etmeyin—~2+ dk güvenli varsayılan; izolasyonda performans bozulmuyorsa daha kısa dinlenme olur.',
            '6 подходящих лонгитюдных исследований: ≤60 с vs >60 с отдыха. Оба варианта растят мышцу; у тренированных с чувствительными мерами более длинный отдых может помочь, сохраняя объём-нагрузку. Практика: на базовых не торопитесь — ~2+ мин по умолчанию; на изоляции короче, если качество подходов держится.',
            'Sechs geeignete Längsschnittstudien: ≤60 s vs >60 s Pause. Beides kann Muskel aufbauen; bei Trainierten deuten empfindliche Maße auf mögliche Vorteile längerer Pausen durch Erhalt der Volumenlast. Praxis: Mehrgelenk nicht hetzen — ~2+ Min als Default; Isolation kürzer, wenn die Satzqualität hält.'
        ),
    },
    {
        id: 'morton2018protein',
        year: 2018,
        source: 'Br J Sports Med',
        authors: 'Morton, Phillips et al.',
        url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5867436/',
        title: L(
            'Protein supplementation and resistance-training gains in mass and strength: meta-analysis',
            'Protein takviyesi ve direnç antrenmanıyla kütle/güç kazanımları: meta-analiz',
            'Белковая добавка и приросты массы/силы при силовых тренировках: метаанализ',
            'Protein-Supplementation und Krafttrainingsgewinne: Metaanalyse'
        ),
        detail: L(
            'Forty-nine RCTs (n=1863). Protein supplementation augmented RET-induced gains in 1RM, fat-free mass and some muscle-size measures. Effect on FFM was smaller with older age and larger in trained people. Beyond ~1.6 g protein/kg/day, extra intake did not further increase FFM gains. Timing is secondary to total daily protein for most trainees.',
            '49 RKÇ (n=1863). Protein takviyesi, 1RM, yağsız kütle ve bazı kas boyutu ölçümlerinde RET kazanımlarını artırdı. YKM etkisi yaşla küçüldü, antrenmanlılarda büyüdü. ~1,6 g protein/kg/gün ötesinde ekstra alım YKM kazanımını daha artırmadı. Çoğu kişi için zamanlama, günlük toplam proteinden ikincildir.',
            '49 РКИ (n=1863). Белок усиливал приросты 1ПМ, безжировой массы и части мер размера мышцы. Эффект на БМТ слабее с возрастом и сильнее у тренированных. Свыше ~1,6 г белка/кг/сут дополнительный приём не давал дальнейшего прироста БМТ. Для большинства тайминг вторичен относительно суточной дозы.',
            '49 RCTs (n=1863). Protein verstärkte RET-Gewinne bei 1RM, fettfreier Masse und einigen Größenmaßen. FFM-Effekt kleiner mit Alter, größer bei Trainierten. Über ~1,6 g Protein/kg/Tag brachte Extra-Zufuhr keinen weiteren FFM-Gewinn. Timing ist für die meisten sekundär zur Tagesgesamtmenge.'
        ),
    },
    {
        id: 'schoenfeld2013timing',
        year: 2013,
        source: 'J Int Soc Sports Nutr',
        authors: 'Schoenfeld, Aragon, Krieger',
        url: 'https://pubmed.ncbi.nlm.nih.gov/24299050/',
        title: L(
            'The effect of protein timing on muscle strength and hypertrophy: a meta-analysis',
            'Protein zamanlamasının güç ve hipertrofiye etkisi: meta-analiz',
            'Влияние тайминга белка на силу и гипертрофию: метаанализ',
            'Effekt des Protein-Timings auf Kraft und Hypertrophie: Metaanalyse'
        ),
        detail: L(
            'Multi-level meta-regression of RCTs on peri-workout protein. After controlling for covariates—especially total protein—timing around the session was not a critical driver of chronic strength/hypertrophy. The popular “anabolic window” is narrower in importance than hitting daily protein targets alongside progressive training.',
            'Antrenman çevresi proteinine dair RKÇ’lerin çok düzeyli meta-regresyonu. Kovaryatlar—özellikle toplam protein—kontrol edilince seans çevresi zamanlama kronik güç/hipertrofinin kritik sürücüsü değildi. Popüler “anabolik pencere”, progresif antrenmanla birlikte günlük protein hedefini tutturmaktan daha az önemlidir.',
            'Многоуровневая метарегрессия РКИ о белке около тренировки. После контроля ковариат — особенно общего белка — тайминг вокруг сессии не был критичным драйвером хронической силы/гипертрофии. «Анаболическое окно» менее важно, чем суточная норма белка плюс прогрессивная нагрузка.',
            'Mehrebenen-Meta-Regression von RCTs zu Peri-Workout-Protein. Nach Kovariatenkontrolle — v. a. Gesamtprotein — war Timing um die Einheit kein kritischer Treiber chronischer Kraft/Hypertrophie. Das „anabole Fenster“ ist weniger wichtig als die tägliche Proteinmenge plus progressives Training.'
        ),
    },
    {
        id: 'hiie2020',
        year: 2020,
        source: 'Med Sci Sports Exerc',
        authors: 'meta-analysis on HIIE vs MICT',
        url: 'https://pubmed.ncbi.nlm.nih.gov/32890201/',
        title: L(
            'Effectiveness of HIIE versus MICT on cardiometabolic risk factors: a meta-analysis',
            'HIIE ile MICT’nin kardiyometabolik risk faktörlerinde etkinliği: meta-analiz',
            'Эффективность HIIE vs MICT для кардиометаболических факторов риска: метаанализ',
            'Wirksamkeit von HIIE vs. MICT bei kardiometabolischen Risikofaktoren: Metaanalyse'
        ),
        detail: L(
            'Fifty-five studies. High-intensity interval exercise outperformed moderate continuous training for VO₂max and flow-mediated dilation; MICT was better for HbA1c. Many body-composition and lipid outcomes were similar. Gym takeaway: intervals are time-efficient for fitness and vascular markers; steady cardio still has a place for glycemic control and preference.',
            '55 çalışma. Yüksek yoğunluklu interval, VO₂max ve akım aracılı dilatasyonda orta sürekli antrenmanı geçti; HbA1c için MICT daha iyiydi. Birçok vücut kompozisyonu ve lipid sonucu benzerdi. Salon çıkarımı: interval fitness ve damar belirteçleri için zamana verimli; sabit kardiyo glisemik kontrol ve tercih için hâlâ yer tutar.',
            '55 исследований. Интервалы высокой интенсивности лучше умеренной непрерывной работы по VO₂max и FMD; MICT лучше по HbA1c. Многие исходы состава тела и липидов сходны. Вывод: интервалы эффективны по времени для фитнеса и сосудистых маркеров; ровное кардио остаётся полезным для гликемии и предпочтений.',
            '55 Studien. Hochintensives Intervalltraining übertraf moderates Dauertraining bei VO₂max und FMD; MICT war besser bei HbA1c. Viele Körperzusammensetzungs- und Lipid-Outcomes ähnlich. Fazit: Intervalle sind zeiteffizient für Fitness und Gefäßmarker; gleichmäßiges Cardio bleibt sinnvoll für Glykämie und Vorlieben.'
        ),
    },
    {
        id: 'nsca2019older',
        year: 2019,
        source: 'J Strength Cond Res (NSCA Position Statement)',
        authors: 'Fragala, Cadore, Dorgo, Izquierdo, Kraemer, Peterson, Ryan',
        url: 'https://journals.lww.com/nsca-jscr/fulltext/2019/08000/resistance_training_for_older_adults__position.1.aspx',
        title: L(
            'Resistance training for older adults: NSCA position statement',
            'Yaşlı yetişkinlerde direnç antrenmanı: NSCA pozisyon bildirisi',
            'Силовые тренировки для пожилых: позиционное заявление NSCA',
            'Krafttraining für ältere Erwachsene: NSCA-Positionspapier'
        ),
        detail: L(
            'Aging reduces muscle mass, strength and function even without disease. NSCA endorses properly designed, supervised RT as safe for healthy older adults: individualized/periodized work toward ~2–3 sets of 1–2 multi-joint exercises per major muscle group at ~70–85% 1RM, 2–3×/week, plus power work at moderate loads with faster concentrics. Supports independent living and counters sarcopenia risk.',
            'Yaşlanma, hastalık olmasa bile kas kütlesi, güç ve işlevi düşürür. NSCA, doğru tasarlanmış ve gözetimli RT’nin sağlıklı yaşlılar için güvenli olduğunu savunur: majör kas grubu başına ~1–2 çok eklemli hareketten 2–3 set, ~%70–85 1RM, haftada 2–3; ayrıca orta yükte daha hızlı konsantrikle power çalışması. Bağımsız yaşamı destekler, sarkopeni riskine karşı koyar.',
            'Старение снижает массу, силу и функцию мышц даже без болезней. NSCA считает правильно спланированную и контролируемую СТ безопасной для здоровых пожилых: ~2–3 подхода по 1–2 многосуставным на крупную группу при ~70–85% 1ПМ, 2–3×/нед, плюс работа на мощность со средними весами и быстрой концентрикой. Поддерживает независимость и противодействует саркопении.',
            'Altern senkt Muskelmasse, Kraft und Funktion auch ohne Krankheit. Die NSCA hält richtig geplantes, beaufsichtigtes KT für gesunde Ältere für sicher: individualisiert/periodisiert Richtung ~2–3 Sätze aus 1–2 Mehrgelenkübungen je großer Muskelgruppe bei ~70–85% 1RM, 2–3×/Woche, plus Power mit mittleren Lasten und schnellerer Konzentrík. Stützt Selbstständigkeit und wirkt Sarkopenie entgegen.'
        ),
    },
    {
        id: 'iusca2021hypertrophy',
        year: 2021,
        source: 'Int J Strength Cond (IUSCA Position Stand)',
        authors: 'IUSCA expert consortium (Schoenfeld et al.)',
        url: 'https://journal.iusca.org/index.php/Journal/article/view/81',
        title: L(
            'IUSCA position stand: Resistance training recommendations to maximize hypertrophy in athletes',
            'IUSCA pozisyon bildirisi: Sporcularda hipertrofiyi en üst düzeye çıkaran RT önerileri',
            'Позиционный документ IUSCA: рекомендации СТ для максимальной гипертрофии у спортсменов',
            'IUSCA-Position Stand: Krafttrainingsempfehlungen zur Hypertrophie-Maximierung bei Athleten'
        ),
        detail: L(
            'Consensus for athletic hypertrophy: volume is a primary driver (often cited ~10+ sets/muscle/week as a practical floor, with higher volumes sometimes useful for lagging muscles); multi-joint rests commonly ≥2 min; isolation/machines can use 60–90 s. Emphasizes progressive overload, exercise variation and recovery management rather than a single magic rep range.',
            'Atletik hipertrofi için uzlaşı: hacim birincil sürücüdür (pratik taban sıkça kas başına haftada ~10+ set; geride kalan kaslar için daha yüksek hacim yararlı olabilir); çok eklemli hareketlerde dinlenme genelde ≥2 dk; izolasyon/makinelerde 60–90 sn olabilir. Tek sihirli tekrar aralığından çok progresif aşırı yükleme, hareket çeşitliliği ve toparlanma yönetimini vurgular.',
            'Консенсус для спортивной гипертрофии: объём — ключевой драйвер (часто ~10+ подходов/мышца/нед как практический минимум; больший объём иногда полезен отстающим мышцам); на многосуставных отдых обычно ≥2 мин; на изоляции/тренажёрах 60–90 с. Акцент на прогрессивную перегрузку, вариативность и восстановление, а не на «волшебный» диапазон повторений.',
            'Konsens für athletische Hypertrophie: Volumen ist Haupttreiber (oft ~10+ Sätze/Muskel/Woche als Praxis-Boden; höheres Volumen manchmal für schwache Muskelgruppen); Mehrgelenk-Pausen oft ≥2 Min; Isolation/Maschinen 60–90 s. Betont progressive Überlast, Übungsvielfalt und Erholung statt eines magischen Wiederholungsbereichs.'
        ),
    },
    {
        id: 'sleep2025nma',
        year: 2025,
        source: 'BMJ Open Sport Exerc Med (network meta-analysis)',
        authors: 'network meta-analysis of RCTs in older adults with insomnia',
        url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11891529/',
        title: L(
            'Impact of different exercise types on sleep quality in older adults with insomnia',
            'Yaşlı uykusuzlukta farklı egzersiz türlerinin uyku kalitesine etkisi',
            'Влияние разных типов упражнений на качество сна у пожилых с бессонницей',
            'Einfluss verschiedener Trainingsarten auf die Schlafqualität älterer Menschen mit Insomnie'
        ),
        detail: L(
            'Twenty-five RCTs (n=2170). Strengthening, aerobic and combined exercise all improved Pittsburgh Sleep Quality Index vs control; strengthening ranked highest in the network (largest PSQI improvement). Reminds gym-goers that lifting is not only for aesthetics—consistent RT can support sleep health, especially later in life.',
            '25 RKÇ (n=2170). Güçlendirme, aerobik ve kombine egzersiz Pittsburgh Uyku Kalitesi İndeksi’ni kontrole göre iyileştirdi; ağda güçlendirme en üst sıradaydı (en büyük PSQI iyileşmesi). Salon kullanımına hatırlatma: kaldırmak yalnızca estetik değildir—düzenli RT, özellikle ilerleyen yaşta uyku sağlığını destekleyebilir.',
            '25 РКИ (n=2170). Силовые, аэробные и комбинированные занятия улучшали индекс качества сна Питтсбурга vs контроль; силовые заняли высший ранг в сети (наибольшее улучшение PSQI). Напоминание: силовые — не только эстетика; регулярная СТ может поддерживать сон, особенно в старшем возрасте.',
            '25 RCTs (n=2170). Kraft-, Ausdauer- und kombiniertes Training verbesserten den Pittsburgh Sleep Quality Index vs. Kontrolle; Krafttraining rangierte im Netzwerk am höchsten (größte PSQI-Verbesserung). Reminder: Heben ist nicht nur Ästhetik — regelmäßiges KT kann die Schlafgesundheit stützen, besonders im höheren Alter.'
        ),
    },
    {
        id: 'essaFalls',
        year: 2022,
        source: 'ESSA Position Statement (Exercise & Sports Science Australia)',
        authors: 'ESSA falls-prevention expert group',
        url: 'https://www.essa.org.au/Common/Uploaded%20files/Publications/Position-statement-updated-exercise-falls-prevention.pdf',
        title: L(
            'ESSA updated position statement: exercise for preventing falls in community-dwelling older people',
            'ESSA güncel pozisyon bildirisi: toplumda yaşayan yaşlılarda düşme önleme egzersizi',
            'Обновлённое заявление ESSA: упражнения для профилактики падений у пожилых в сообществе',
            'Aktualisierte ESSA-Stellungnahme: Training zur Sturzprävention bei selbstständig lebenden Älteren'
        ),
        detail: L(
            'Balance-challenging exercise is central to fall prevention; resistance training alone is not shown to prevent falls but remains recommended (aligning with WHO) for muscle, bone and joint health ≥2 days/week. Functional tasks (sit-to-stand, stair work, obstacle negotiation) transfer better to daily life. Gyms that mix strength with balance/functional circuits serve older members especially well.',
            'Düşme önlemede dengeyi zorlayan egzersiz merkezidir; yalnız direnç antrenmanının düşmeleri önlediği gösterilmemiştir ama (WHO ile uyumlu) kas/kemik/eklem sağlığı için haftada ≥2 gün önerilir. Fonksiyonel görevler (otur-kalk, merdiven, engel) günlük yaşama daha iyi aktarılır. Güç + denge/fonksiyonel devreleri birleştiren salonlar yaşlı üyelere özellikle iyi hizmet eder.',
            'Упражнения с вызовом балансу — ядро профилактики падений; одна силовая не доказала профилактику падений, но (как у ВОЗ) рекомендуется ≥2 дней/нед для мышц, костей и суставов. Функциональные задачи (вставание, лестницы, препятствия) лучше переносятся в быт. Залы, сочетающие силу с балансом/функционалом, особенно полезны пожилым.',
            'Gleichgewichtlich forderndes Training ist zentral zur Sturzprävention; Kraft allein verhindert Stürze laut Evidenz nicht, bleibt aber (wie WHO) ≥2 Tage/Woche für Muskel-, Knochen- und Gelenkgesundheit empfohlen. Funktionale Aufgaben (Aufstehen, Treppen, Hindernisse) übertragen sich besser auf den Alltag. Studios mit Kraft plus Balance/Funktionszirkeln dienen älteren Mitgliedern besonders gut.'
        ),
    },
];

export function getFitnessExerciseGroups(lang) {
    return FITNESS_EXERCISE_GROUPS.map((g) => ({
        id: g.id,
        label: pick(g.label, lang),
        exercises: g.exercises.map((e) => ({
            id: e.id,
            name: pick(e.name, lang),
            image: e.image,
            muscles: pick(e.muscles, lang),
        })),
    }));
}

export function getFitnessStudies(lang) {
    return FITNESS_STUDIES.map((s) => ({
        id: s.id,
        year: s.year,
        source: s.source,
        authors: s.authors,
        url: s.url,
        title: pick(s.title, lang),
        detail: pick(s.detail, lang),
    }));
}
