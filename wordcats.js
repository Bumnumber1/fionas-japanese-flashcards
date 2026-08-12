// Shared word taxonomy for Fiona's Japanese site.
//
// TWO layers live here:
//   1. CATS    - the meaning taxonomy (animals, food, places...). The Game Arcade
//                builds its word baskets from it; the flashcard page uses it as
//                raw material for its meaning-based drawers.
//   2. Grouping - how the flashcard page SORTS cards, and how that sorting grows
//                up. ONE ordered rule table gives every card exactly one LEAF;
//                each of the 5 stages is only a ROLL-UP that merges leaves into
//                visible drawers. Because a roll-up only ever merges, a card can
//                never move sideways between stages - it only ever moves into a
//                sub-drawer of the drawer it was already in.
//
// Loaded by index.html and arcade.html. No DOM and no localStorage in here, so
// the node harness can audit the whole thing directly.

window.WordCats = (() => {

    // A word may belong to several categories: matched on en (case-insensitive),
    // pos, and jp where noted. 'Everything Else' catches words matching nothing.
    // meaning:true marks the meaning-based groups handed to Odd One Out.
    const CATS = [
        { key: 'animals', icon: '🐾', name: 'Animals', meaning: true,
          en: /animal|pupp|kitten|\bdogs?\b|\bcats?\b|\bbirds?\b|\bfish|goldfish|rabbit|bunny|elephant|\blions?\b|tiger|\bbears?\b|panda|monkey|mouse|mice|horse|pony|\bcows?\b|\bpigs?\b|sheep|goat|\bchicks?\b|duck|frog|snake|turtle|tortoise|hamster|\bfox|wol(f|ves)|deer|whale|dolphin|shark|octopus|squid|crab|shrimp|insect|\bbugs?\b|butterfl|beetle|dragon\b|dragonfly|\bants?\b|\bbees?\b|honeybee|spider|penguin|\bowls?\b|eagle|\bcrows?\b|sparrow|swan|\bcranes?\b|dove|pigeon|zebra|giraffe|kangaroo|koala|hippo|rhino|camel|squirrel|hedgehog|snail|jellyfish|starfish|\bseals?\b|otter|raccoon|tanuki|firefly|cicada|cricket|grasshopper|ladybug|gorilla|lizard|\bbats?\b|worm|\bpets?\b|cheetah|parakeet|sardine|peacock|\bzoo\b|turkey/i },
        { key: 'food', icon: '🍎', name: 'Food & Drink', meaning: true,
          en: /food|drink|\beat|meal\b|breakfast|lunch|dinner|supper|snack|dessert|candy|sweets|chocolate|cookie|biscuit|cake|ice cream|pudding|donut|doughnut|\brice\b|bread|toast|sandwich|noodle|ramen|udon|soba\b|pasta|spaghetti|pizza|sushi|onigiri|bento|curry|soup|miso|stew\b|salad|\beggs?\b|meat\b|beef|pork|\bham\b|sausage|chicken|steak|tempura|tofu|seaweed|fruit|apple|banana|orange\b|grape|strawberry|\bpeach(es)?\b(?!\s*pink)|\bpears?\b|melon|cherr(y|ies)|lemon|tangerine|mandarin|persimmon|pineapple|kiwi|mango|chestnut|vegetable|carrot|potato|tomato|onion|cucumber|pumpkin|\bcorn\b|mushroom|cabbage|lettuce|radish|eggplant|\bbeans?\b|spinach|broccoli|juice|\bmilk\b(?!y)|\btea\b|coffee|cocoa|soda|cola\b|water \(|yogurt|cheese|butter\b|\bjam\b|\bhoney\b(?!\s*bee)|sugar|salt\b|pepper|sauce|soy|ketchup|delicious|yummy|tasty|hungry|thirsty|bitter|sour\b|spicy|sweet\b|mochi|dango|dumpling|senbei|taiyaki|takoyaki|okonomiyaki|yakisoba|gyoza|katsu\b|cracker|gum\b|caramel|gummy|omelette|omelet\b|feast|taro\b|clam\b|acorn/i },
        { key: 'people', icon: '👪', name: 'People & Family', meaning: true,
          en: /family|mother|\bmom|father|\bdad|parent|sister|brother|sibling|grand(ma|pa|mother|father|child)|baby|child|kid\b|kids\b|\bboys?\b|girl|friend|teacher|student|person|people|\bman\b|\bmen\b|woman|women|uncle|\baunts?\b|cousin|everyone|everybody|classmate|neighbo|doctor|nurse|dentist|\bpolice\b(?!\s*car)|firefighter|farmer|bakers?\b|chef|\bcook\b|singer|driver|pilot|astronaut|player|scientist|professor|hairdresser|actor|\bvet\b|princess|prince\b|\bking\b|queen|knight|soldier|servant|retainer|messenger|samurai|ninja|captain|announcer|angel|celebrity|twins|elderly|adult|clerk|hero|villain|character \(|main character|audience|orihime|hikoboshi|santa\b|sweetheart|myself|oneself|\bwho\b|worker|\bjobs?\b|\bwork\b/i },
        { key: 'school', icon: '🎒', name: 'School & Things', meaning: true,
          en: /school|class|homework|lesson|stud(y|ies)|\btests?\b|exam\b|book|notebook|dictionary|magazine|comic|manga|encyclopedia|pencil|\bpens?\b|eraser|crayon|marker|scissors|glue|paper|ruler|desk|chair|\bbags?\b|backpack|randoseru|blackboard|whiteboard|math|p\.e\.|calligraphy|science|social studies|english|kanji|timetable|schedule|\btoys?\b|\bballs?\b|doll|puzzle|\bgames?\b|card|\bbox\b|umbrella|telephone|phone|computer|tablet|\btv\b|television|camera|clock|watch\b|\bkeys?\b|wallet|purse|present|gift|letter|stamp|sticker|envelope|picture|photo|piano|guitar|drum|flute|violin|recorder|whistle|racket|bicycle|bike\b|kite\b|robot|origami|craft|towel|soap|toothbrush|\bcups?\b|glass\b|plate|chopstick|fork\b|spoon|knife|bottle|lunch box|lunchbox|money|\byen\b|coin|\bcars?\b|\bbus\b|train\b|taxi|truck|airplane|plane\b|\bships?\b|boat|rocket|vehicle|ambulance|sled|sleigh|bell\b|wreath|ornament|spinning top|lantern|candle|balloon|microphone|newspaper|remote|outlet|battery|air conditioner|electric fan|lamp|screen|curtain|\blids?\b|switch|machine|flag|thermos|treasure|jewel|gem\b|medal|trophy|certificate|prize|blocks|marble|skateboard|page\b|diary|\bmaps?\b|ticket|futon|pillow|shelf|drawer|broom|instrument|mask\b|\bpot\b|\bpan\b|stuffed animal|jump rope|kendama|karuta|ribbon|\blists?\b|goods|merchandise|wrapping|parasol|bowls?\b|paddle|rope\b|fan\b|banner|streamer|paint\b|swing\b|slide\b|seesaw|sandbox|song\b|lullaby|carol|melody|shower\b|price|cash register|receipt|sale\b|savings|free of charge|\bstor(y|ies)\b|tale\b|folktale|legend|movie/i },
        { key: 'places', icon: '🏞️', name: 'Places & Nature', meaning: true,
          en: /park\b|mountain|\bhill|\briver|\bsea\b|ocean|beach|forest|woods?\b|\btrees?\b|flower|blossom|grass|\bsky\b|\bstars?\b|moon|\bsun\b|garden|house|home\b|\btowns?\b|\bcit(y|ies)\b|village|station|\bshop|store\b|market|restaurant|hospital|pharmacy|\bzoo\b|aquarium|pool\b|playground|road|street|bridge|island|lake\b|pond|field|meadow|sand|stone|rock\b|boulder|leaf|leaves|bamboo|sakura|nature|world|earth|japan|country|place\b|room\b|kitchen|bathroom|bedroom|living room|entryway|entrance|toilet|bath\b|roof|stairs|hallway|elevator|building|castle|shrine|temple\b|tower|post office|bank\b|bakery|cafe|theater|theatre|bookstore|greengrocer|butcher|festival|outside|inside|middle\b|behind|beside|next to|corner|above|below|\bunder\b|in front|valley|cliff|summit|\bpeaks?\b|tunnel|intersection|crosswalk|slope|plaza|square\b|cave\b|waterfall|hot spring|amusement|museum|university|cram school|space\b|planet|comet|constellation|milky way|galaxy|horizon|ground\b|^air$|soil|dirt\b|riverbank|veranda|scenery|ranch|pasture|farm|rice field|vegetable field|observation deck|path\b|harbor|port\b|window|door\b|wall\b|floor\b|yard\b|icicle\b|puddle|pinecone|moss\b|branch\b|stem\b|seed\b|bud\b|petal|foliage|sunflower|tulip|dandelion|rose\b|hydrangea|lily|iris\b|holly|mistletoe|fir tree|pampas|library|picnic|camping|hiking|barbecue|bonfire|firework|traffic|handrail|emergency exit|seashell|\bwaves?\b|bench\b|direction|\bwalk\b/i },
        { key: 'weather', icon: '⛅', name: 'Weather & Seasons', meaning: true,
          en: /weather|\brain|snow|wind\b|windy|wintry|cloud|sunny|storm|thunder|lightning|typhoon|rainbow|season|^spring|summer|autumn|winter|temperature|humid|breeze|\bfog|frost|hail\b|sleet|blizzard|icicle|\bhot\b|\bcold|warm\b|chilly|\bice\b| shower$|downpour|sunshine|sunlight|sunset|sunrise/i },
        { key: 'colors', icon: '🎨', name: 'Colors & Shapes', meaning: true,
          en: /colou?r|\bred\b|blue\b|yellow|green\b|black(?!board)|white(?!board)|pink\b|purple|orange \(|brown|gr[ae]y\b|gold\b|silver|shape|circle|square|triangle|rectangle|\bround\b|heart shape|\bdiamond\b(?!\s*rice)|\bdots?\b|stripe|navy/i,
          jp: /いろ$/ },
        { key: 'body', icon: '👚', name: 'Body & Clothes', meaning: true,
          en: /\bbody|\bhead|\bhair|face\b|\beyes?\b|eyebrow|\bears?\b|nose|mouth|tooth|teeth|neck|shoulder|\barms?\b|hand\b|hands\b|finger|\blegs?\b|foot\b|feet\b|knee|elbow|stomach|tummy|belly|\bchest\b|cheek|chin\b|forehead|tongue|\bnails?\b|\bskin\b|bone|\blips?\b|beard|whisker|mustache|clothes|clothing|shirt|pants|trousers|jeans|shorts|skirt|dress\b|dressed|\bhats?\b|\bcaps?\b|shoes?\b|boots?\b|socks?\b|coat\b|jacket|sweater|scarf|glove|mitten|kimono|yukata|pajama|pyjama|wear\b|uniform|button|pocket|glasses|belt\b|swimsuit|sandal|slipper|apron|sweat\b|fever|cough|sneeze|runny nose|sick\b|hurt|itchy|band-aid|bandage|height\b|costume|cape\b|cloak|helmet|obi sash|hair ornament|suntan|sunburn|horn\b|smell\b|taste|flavor|health\b|sleep\b|diaper|armou?r|crown\b/i },
        { key: 'time', icon: '⏰', name: 'Time & Numbers', meaning: true, pos: ['counter'],
          en: /time\b|o'clock|hour\b|minute|second \(|today|tomorrow|yesterday|\bdays?\b|week\b|weekend|month|year\b|years\b|morning|noon\b|afternoon|evening|\bnight|tonight|\bnow\b|later|soon\b|\bearly|\blate\b|number|zero|\bone\b(?!['’])|\btwo\b|three|\bfour\b|five|\bsix\b|seven|\beight|\bnine\b|\bten\b|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|\bcount\b|counting|half\b|birthday|\bdate\b|calendar|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march\b|april|june|july|august|september|october|november|december|holiday|always|sometimes|often|usually|never|every day|daily|first\b|\bwhen\b|deadline|\b\d+(st|nd|rd|th)\b|how many|times\b|once\b|twice|dusk|midnight|past\b|future|long ago|ago\b|christmas|halloween|\beve\b|^may$|\bnext\b|the last|ending\b|beginn/i },
        { key: 'actions', icon: '🏃', name: 'Action Words', meaning: false, pos: ['verb'] },
        { key: 'describe', icon: '💖', name: 'Describing Words', meaning: false, pos: ['i-adj', 'na-adj', 'adverb'] },
        { key: 'phrases', icon: '💬', name: 'Phrases & Greetings', meaning: false, pos: ['phrase', 'expression'] },
        { key: 'other', icon: '📦', name: 'Everything Else', meaning: false, other: true },
    ];

    function catMatch(cat, v) {
        if (cat.other) return !CATS.some(c => !c.other && catMatch(c, v));
        return !!((cat.pos && cat.pos.indexOf(v.pos) >= 0)
            || (cat.en && cat.en.test(v.en || ''))
            || (cat.jp && cat.jp.test(v.jp || '')));
    }
    function catWords(vocab, cat) { return vocab.filter(v => catMatch(cat, v)); }

    /* ==================================================================
       GROUPING: how the flashcard page sorts cards, and how that sorting
       grows up over the five years of the journey.
       ================================================================== */

    // Every card gets exactly one LEAF. Stages only ever MERGE leaves into
    // visible buckets, so a card can never move sideways between stages.

    // Closed kana sets, matched on the WHOLE string. A prefix test would wrongly
    // grab それから, それで, そこで, こうえん, どうぶつ.
    const KOSOADO = 'これ それ あれ どれ この その あの どの ここ そこ あそこ どこ こちら そちら あちら どちら こんな そんな あんな どんな こう そう ああ どう'.split(' ');
    const DAIMEISHI = 'わたし ぼく あなた あなたたち かれ かのじょ かれら わたしたち ぼくたち じぶん みんな きみ おれ'.split(' ');
    const GIMONSHI = 'なに なん だれ どなた いつ なぜ どうして いくら いくつ なんじ なんがつ なんにち なんさい どのくらい どうやって'.split(' ');
    // しつもん ("Question") is a plain noun and ですか is です+か, so neither is a
    // ぎもんし - they are deliberately absent.
    const POINT_SET = new Set(KOSOADO.concat(DAIMEISHI, GIMONSHI));
    const SETSUZOKU = new Set('だから でも そして それから しかし ところが それで それに なぜなら そこで'.split(' '));
    const ONOMA_SET = new Set('びっくり うっかり はっきり しっかり のんびり ゆっくり そっと うっとり どんより まったり ぼんやり ぼーっと さっそく'.split(' '));

    const NUM_WORD = /^(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b/i;
    const COUNTED = /^(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\s+(things?|persons?|people|years?|whole days?|days?|bites?|mouthfuls?|slices?|times?|books?|cupfuls?|minutes?|hours?|months?|weeks?)\b/i;
    const OCLOCK = /^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+o.clock\b/i;
    // The trailing-noun list is what keeps ごにんばやし "five court musicians" and
    // さんにんかんじょ "three court ladies" OUT of the numbers drawer.
    function isNumeral(v) {
        const en = v.en || '';
        if (/^\d/.test(en)) return true;
        if (!NUM_WORD.test(en)) return false;
        return /^\w+\s*(\(|$)/.test(en) || COUNTED.test(en) || OCLOCK.test(en);
    }

    const MOVEMENT = /to (go|come|walk|run|swim|fly|jump|climb|ride|enter|leave|return|arrive|carry|bring|move|fall|drop|rise|stand|sit|crawl|dance|chase|escape|cross|follow|slide|roll|float|sink|dive|hop|travel|visit|gather|line up)\b|^(go|come|run|walk|swim|fly|jump|climb|ride|dance|enter|leave|return|arrive|move|fall)\b|get (up|on|off|in)\b|wake up|stand up|sit down|run away|go out|come back/i;
    const MIND = /to (say|speak|talk|tell|ask|answer|read|write|study|learn|teach|think|know|remember|forget|understand|believe|hope|wish|want|like|love|hate|feel|cry|laugh|smile|worry|decide|choose|imagine|dream|sing|listen|hear|look|see|watch|notice|praise|scold|thank|apologize|promise|greet|explain|call|invite|count)\b|^(say|tell|read|write|think|know|sing|listen|hear|see|watch|cry|laugh|like|love|want|study)\b/i;
    const STORYCHAR = /ghost|witch|\boni\b|ogre|demon|vampire|zombie|wizard|monster|devil|skeleton|mummy|spirit|\bgod\b|angel|fairy|mermaid|giant|robot|alien|snowman|scarecrow|momotaro|urashima|kaguya|kappa|tengu|yokai|dracula|princess|prince\b|\bking\b|queen|knight|samurai|ninja|hero|villain/i;

    // Meaning carve-outs. These run BEFORE the broad CATS 'places' and 'school'
    // buckets, which would otherwise swallow ~250 words each into one drawer.
    const L = {
        where:  /^(next to|beside|behind|in front|under|above|below|inside|outside|on top|corner|between|near|the middle|left|right|front|back|top|bottom|side|around|across|beyond|opposite)\b/i,
        sky:    /\bsky\b|\bstars?\b|moon|\bsun\b|sunrise|sunset|rainbow|cloud|planet|galaxy|milky way|horizon|space\b|comet|constellation|universe|light\b|sunlight|sunshine|shooting star/i,
        plant:  /\btrees?\b|flower|blossom|grass|leaf|leaves|bamboo|sakura|seed\b|bud\b|petal|acorn|forest|woods\b|garden|pinecone|moss\b|branch\b|stem\b|sunflower|tulip|dandelion|\brose\b|hydrangea|lily|iris\b|holly|mistletoe|fir tree|pampas|bouquet|full bloom|foliage|clover|ivy|vine|cactus|weed/i,
        nature: /mountain|\bhill|\briver|\bsea\b|ocean|beach|island|lake\b|pond|field\b|meadow|sand|stone|rock\b|boulder|valley|cliff|summit|\bpeaks?\b|cave\b|waterfall|hot spring|ground\b|\bwaves?\b|water\b|\bfire\b|\bice\b|icicle|puddle|soil|dirt\b|riverbank|scenery|nature|earth\b|\bworld\b|shore|seashell|volcano|desert|swamp|marsh/i,
        travel: /\bcars?\b|\bbus\b|train\b|taxi|truck|airplane|plane\b|\bships?\b|boat|bicycle|bike\b|station|airport|ticket|\bmaps?\b|road|street|bridge|trip\b|journey|travel|rocket|vehicle|ambulance|sled|sleigh|raft|drive\b|harbor|port\b|tunnel|crosswalk|intersection|subway|helicopter|motorcycle|scooter|wagon|carriage|voyage|sightseeing/i,
        money:  /money|\byen\b|coin|wallet|purse|price|receipt|\bsale\b|shopping|change \(money|cash|savings|allowance|discount|bill\b|budget|cost\b|payment|free of charge/i,
        town:   /\btowns?\b|\bcit(y|ies)\b|village|\bshop|store\b|market|restaurant|hospital|pharmacy|\bzoo\b|aquarium|pool\b|playground|park\b|building|castle|shrine|temple\b|tower|post office|bank\b|bakery|cafe|theater|theatre|bookstore|greengrocer|butcher|museum|university|cram school|library|plaza|square\b|amusement|department store|convenience store|hotel|factory|farm|ranch|neighborhood|countryside/i,
        house:  /\broom\b|kitchen|bathroom|bedroom|living room|entryway|entrance|toilet|bath\b|roof|stairs|hallway|elevator|window|door\b|wall\b|floor\b|yard\b|veranda|balcony|garage|desk\b|chair|table\b|\bbeds?\b|sofa|couch|shelf|drawer|closet|cupboard|curtain|\blamps?\b|futon|pillow|blanket|mirror|clock|watch\b|\bkeys?\b|telephone|phone|computer|tablet|\btv\b|television|camera|refrigerator|fridge|microwave|oven|stove|washing machine|air conditioner|electric fan|heater|vacuum|outlet|battery|switch|remote|machine|appliance|\bpots?\b|\bpans?\b|kettle|\bcups?\b|glass\b|plate|\bbowls?\b|chopstick|fork\b|spoon|knife|bottle|thermos|\blids?\b|tray|basket|\bbox\b|\bbags?\b|backpack|randoseru|umbrella|parasol|towel|soap|toothbrush|broom|\bmop\b|bucket|\btools?\b|hammer|scissors|\bglue\b|\btape\b|string|rope\b|ladder|nail\b|screw|handrail|electricity|furniture|household|screen\b|handle/i,
        chore:  /clean(ing|up)?\b|laundry|\bchores?\b|errand|tidy|tidying|washing|housework|dishes|sweep|garbage|trash|recycl|helping|\bhelp\b|duty\b|turn \(chore|wiping|grooming|shopping list|taking out|dusting|ironing|folding|watering/i,
        sport:  /\bsports?\b|soccer|baseball|tennis|basketball|volleyball|swimming|\bswim\b|karate|judo|kendo|sumo|gymnast|\brace\b|footrace|marathon|relay|dodgeball|skate|skating|\bski|surf|climbing|\bmatch\b|tournament|\bteam\b|practice|coach\b|exercise|\bjump\b|running|cycling|bowling|golf|rugby|badminton|athletic|training|referee|medal|trophy|score\b|winner|victory|defeat/i,
        event:  /celebrat|festival|\bpart(y|ies)\b|ceremony|new year|birthday|wedding|congratulat|anniversary|parade|firework|christmas|halloween|\beve\b|holiday|matsuri|tanabata|hinamatsuri|obon|setsubun|decoration|ornament|wreath|\bgift\b|present\b|invitation|feast|banquet|reunion|event\b|carnival|fair\b/i,
        doing:  /\bcooking\b|\bbaking\b|camping|hiking|picnic|barbecue|bonfire|fishing\b|gardening|shopping trip|sleepover|nap\b|\bsleep\b|\brest\b|\bbreak\b|\bwalking\b|crawling|jogging|stretch|bath time|playtime|hobby|pastime|activity|\bwork\b|\bjobs?\b|\btask\b|preparation|getting ready|reservation/i,
        toy:    /\btoys?\b|\bdolls?\b|puzzle|\bgames?\b|\bballs?\b|blocks\b|marble|kite\b|robot\b|origami|spinning top|kendama|karuta|jump rope|skateboard|stuffed animal|teddy|playing card|board game|video game|swing\b|slide\b|seesaw|sandbox|balloon|bubble|yo-yo|building block|figurine/i,
        art:    /\bdraw|paint|craft|\bdance|\bsing|music|instrument|\bart\b|photo|colou?ring|\bclay\b|knit|\bsew\b|piano|guitar|drum|flute|violin|recorder|whistle|\bsongs?\b|lullaby|carol|melody|rhythm|concert|orchestra|choir|brush\b|canvas|sketch|sculpture|pottery|\bband\b|microphone|\bstage\b|performance/i,
        story:  /\bbooks?\b|comic|manga|magazine|newspaper|diary|\bletters?\b|poem|riddle|news\b|dictionary|encyclopedia|\btales?\b|legend|\bstor(y|ies)\b|folktale|myth|novel|picture book|\bpage\b|chapter|title\b|author|\bmovie|film\b|anime|drama|script/i,
        school: /school|\bclass\b|classroom|classmate|homework|lesson|stud(y|ies)|\btests?\b|\bexams?\b|notebook|pencil|\bpens?\b|eraser|crayon|marker|ruler|blackboard|whiteboard|\bmath\b|p\.e\.|calligraphy|science|social studies|english\b|kanji\b|hiragana|katakana|timetable|schedule|\bclub\b|teacher|student|principal|uniform|graduation|entrance ceremony|field trip|sports day|recess|semester|term\b|grade\b|report card|textbook|stationery/i,
        feel:   /feeling|\bheart\b|mood|dream|memory|hope\b|wish|courage|\bluck|worry|worried|\blove\b|\bfun\b|surprise|kindness|gratitude|tears|laughter|energy|emotion|happiness|sadness|anger|fear\b|loneliness|excitement|nervous|patience|confidence|pride|something to be proud|relief|comfort|sympathy|affection|jealous|shyness|calm/i,
    };

    // Words the meaning rules genuinely cannot see from an English gloss alone.
    const JP_PIN = {
        'でんき': 'house', 'ひかり': 'sky', 'さしみ': 'food', 'おかず': 'food', 'まんかい': 'plant',
        'はなたば': 'plant', 'かどまつ': 'event', 'たなばたかざり': 'event', 'せんこう': 'event',
        'ツリー': 'event', 'うきわ': 'toy', 'いかだ': 'travel', 'ドライブ': 'travel', 'ジャンプ': 'sport',
        'ハイハイ': 'doing', 'ちゅうくらい': 'idea', 'ほんとう': 'idea', 'わすれもの': 'idea',
        'あと': 'time', 'チャンピオン': 'people', 'でんわばんごう': 'house',
    };
    // たとえば is tagged `expression` in curriculum_y3 but is a 副詞.
    const POS_FIX = { 'たとえば': 'adverb' };

    // CATS entries by key, for the meaning tests below.
    const CAT = {};
    CATS.forEach(c => { CAT[c.key] = c; });

    // ORDER IS LOAD-BEARING, and this is the whole grammar-honesty guarantee:
    // part-of-speech leaves are tested BEFORE meaning leaves. あかい can only
    // reach いけいようし and あか only Colours; きれい can only reach なけいようし;
    // いつも/ときどき can only reach ふくし.
    function leafOf(v) {
        const pos = POS_FIX[v.jp] || v.pos, jp = v.jp || '', en = v.en || '';
        if (pos === 'kana') return 'kana';
        if (pos === 'noun' && POINT_SET.has(jp)) return 'point';
        if (pos === 'particle' || (pos === 'expression' && SETSUZOKU.has(jp))) return 'conj';
        if (pos === 'adverb') return (/^(.)(.)\1\2$/.test(jp) || ONOMA_SET.has(jp)) ? 'onoma' : 'adverb';
        if (pos === 'i-adj') return 'iadj';
        if (pos === 'na-adj') return 'naadj';
        if (pos === 'counter') return 'count';
        if (pos === 'expression' || pos === 'phrase') return 'phrase';
        if (pos === 'verb') return MOVEMENT.test(en) ? 'vmove' : (MIND.test(en) ? 'vmind' : 'vmake');
        // ---- noun leaves ----
        if (JP_PIN[jp]) return JP_PIN[jp];
        if (isNumeral(v)) return 'count';
        if (L.where.test(en)) return 'where';
        if (catMatch(CAT.people, v) || STORYCHAR.test(en)) return 'people';
        if (catMatch(CAT.animals, v)) return 'animals';
        if (catMatch(CAT.body, v)) return 'body';
        if (catMatch(CAT.food, v)) return 'food';
        if (catMatch(CAT.weather, v)) return 'weather';
        if (L.sky.test(en)) return 'sky';
        if (L.plant.test(en)) return 'plant';
        if (L.nature.test(en)) return 'nature';
        if (L.travel.test(en)) return 'travel';
        if (L.money.test(en)) return 'money';
        if (L.town.test(en)) return 'town';
        if (L.house.test(en)) return 'house';
        if (L.chore.test(en)) return 'chore';
        if (L.sport.test(en)) return 'sport';
        if (L.event.test(en)) return 'event';
        if (L.doing.test(en)) return 'doing';
        if (L.toy.test(en)) return 'toy';
        if (L.art.test(en)) return 'art';
        if (L.story.test(en)) return 'story';
        if (L.school.test(en)) return 'school';
        if (catMatch(CAT.time, v)) return 'time';      // after event/food, or クリスマス and おやつ land here
        if (catMatch(CAT.colors, v)) return 'colors';
        if (catMatch(CAT.places, v)) return 'places';  // broad catch-all, hence last
        if (catMatch(CAT.school, v)) return 'things';  // ditto
        if (L.feel.test(en)) return 'feel';
        // By elimination every concrete drawer has been tried, so a noun that
        // reaches here is an abstract idea (なかなおり, きょうみ, ちから...).
        if (pos === 'noun') return 'idea';
        return 'misc';
    }

    // ---- the five stages: each is only a roll-up of leaves ----
    const VERB3 = ['vmove', 'vmind', 'vmake'];
    const ADJ4 = ['iadj', 'naadj', 'adverb', 'onoma'];
    const NAT = ['weather', 'sky', 'plant', 'nature'];
    const TOWN = ['travel', 'money', 'town', 'places', 'where'];
    const HOME = ['house', 'school', 'story', 'things'];
    const PLAY = ['toy', 'art', 'colors', 'sport', 'chore', 'event', 'doing'];
    const HEART = ['feel', 'idea', 'misc'];

    // label/jp/emoji/colour per bucket key, per stage. `parent` is where a bucket
    // came from, so a thin drawer can be folded back into it.
    const B = {
        kana:    { emoji: '✏️', color: '#795548' },
        point:   { emoji: '👉', color: '#7e57c2' },
        verbs:   { emoji: '🏃', color: '#00897b' },
        vmove:   { emoji: '🏃', color: '#00897b', parent: 'verbs' },
        vrest:   { emoji: '🛠️', color: '#00695c', parent: 'verbs' },
        vmind:   { emoji: '💭', color: '#0097a7', parent: 'vrest' },
        vmake:   { emoji: '🛠️', color: '#00695c', parent: 'vrest' },
        describe:{ emoji: '💖', color: '#ec407a' },
        iadj:    { emoji: '⭐', color: '#26a69a', parent: 'describe' },
        naadj:   { emoji: '🌸', color: '#ec407a', parent: 'describe' },
        adverb:  { emoji: '💨', color: '#7cb342', parent: 'describe' },
        onoma:   { emoji: '✨', color: '#ffa726', parent: 'adverb' },
        say:     { emoji: '👋', color: '#f9a825' },
        conj:    { emoji: '🔗', color: '#3949ab', parent: 'say' },
        numtime: { emoji: '⏰', color: '#3f51b5' },
        people:  { emoji: '👪', color: '#4caf50' },
        animals: { emoji: '🐾', color: '#8d6e63' },
        food:    { emoji: '🍎', color: '#ff9800' },
        outside: { emoji: '🌳', color: '#689f38' },
        nature:  { emoji: '⛅', color: '#689f38', parent: 'outside' },
        town:    { emoji: '🚃', color: '#2196f3', parent: 'outside' },
        home:    { emoji: '🏠', color: '#546e7a' },
        play:    { emoji: '🎉', color: '#d81b60' },
        heart:   { emoji: '💫', color: '#8e24aa', parent: 'play' },
    };

    const STAGES = [
        {
            year: 1, name: 'Word Baskets',
            blurb: 'Right now your cards live in picture baskets — animals with animals, food with food — and three little word baskets: doing words, describing words and words we say.',
            order: ['kana', 'point', 'verbs', 'describe', 'say', 'numtime', 'people', 'animals', 'food', 'outside', 'home', 'play'],
            labels: {
                kana: ['Letters', 'もじ'], point: ['Pointing & Asking Words', 'こそあど'],
                verbs: ['Doing Words', 'うごく ことば'], describe: ['Describing Words', 'ようす ことば'],
                say: ['Greetings & Little Words', 'あいさつ'], numtime: ['Numbers, Counting & Time', 'かずと じかん'],
                people: ['People, Bodies & Clothes', 'ひとと からだ'], animals: ['Animals', 'どうぶつ'],
                food: ['Food & Drink', 'たべもの'], outside: ['Outside & Going Places', 'そとの せかい'],
                home: ['Home, School & Things', 'おうちと がっこう'], play: ['Fun, Feelings & Magic', 'たのしい こと'],
            },
            buckets: { kana: ['kana'], point: ['point'], verbs: VERB3, describe: ADJ4, say: ['phrase', 'conj'],
                numtime: ['count', 'time'], people: ['people', 'body'], animals: ['animals'], food: ['food'],
                outside: NAT.concat(TOWN), home: HOME, play: PLAY.concat(HEART) },
        },
        {
            year: 2, name: 'い-Words and な-Words',
            blurb: 'Your describing basket just split three ways — い-words, な-words and how-words — because now you know the trick: おいしくない but すきじゃない!',
            order: ['kana', 'point', 'verbs', 'iadj', 'naadj', 'adverb', 'say', 'numtime', 'people', 'animals', 'food', 'nature', 'town', 'home', 'play', 'heart'],
            labels: {
                kana: ['Letters', 'もじ'], point: ['Pointing & Asking Words', 'こそあど'],
                verbs: ['Doing Words', 'うごく ことば'], iadj: ['い-Words', 'い ことば'],
                naadj: ['な-Words', 'な ことば'], adverb: ['How & How-Often Words', 'どんなふうに'],
                say: ['Greetings & Little Words', 'あいさつ'], numtime: ['Numbers, Counting & Time', 'かずと じかん'],
                people: ['People, Bodies & Clothes', 'ひとと からだ'], animals: ['Animals', 'どうぶつ'],
                food: ['Food & Drink', 'たべもの'], nature: ['Weather, Sky & Nature', 'てんきと しぜん'],
                town: ['Places, Shops & Getting There', 'まちと のりもの'], home: ['Home, School & Things', 'おうちと がっこう'],
                play: ['Play, Sport, Art & Colours', 'あそびと いろ'], heart: ['Heart, Ideas & Magic', 'きもちと かんがえ'],
            },
            buckets: { kana: ['kana'], point: ['point'], verbs: VERB3, iadj: ['iadj'], naadj: ['naadj'],
                adverb: ['adverb', 'onoma'], say: ['phrase', 'conj'], numtime: ['count', 'time'],
                people: ['people', 'body'], animals: ['animals'], food: ['food'], nature: NAT, town: TOWN,
                home: HOME, play: PLAY, heart: HEART },
        },
        {
            year: 3, name: 'Verbs Get Rooms',
            blurb: 'Your Doing Words got so big they now have two rooms: the ones you can film, and the ones that happen with your hands, your mouth and your head.',
            order: ['kana', 'point', 'vmove', 'vrest', 'iadj', 'naadj', 'adverb', 'say', 'numtime', 'people', 'animals', 'food', 'nature', 'town', 'home', 'play', 'heart'],
            labels: {
                kana: ['Letters', 'もじ'], point: ['Pointing & Asking Words', 'こそあど'],
                vmove: ['Doing Words · Going & Moving', 'いく はしる とぶ'],
                vrest: ['Doing Words · Making, Saying & Thinking', 'つくる いう おもう'],
                iadj: ['い-Words', 'い ことば'], naadj: ['な-Words', 'な ことば'],
                adverb: ['How & How-Often Words', 'どんなふうに'], say: ['Greetings & Little Words', 'あいさつ'],
                numtime: ['Numbers, Counting & Time', 'かずと じかん'], people: ['People, Bodies & Clothes', 'ひとと からだ'],
                animals: ['Animals', 'どうぶつ'], food: ['Food & Drink', 'たべもの'],
                nature: ['Weather, Sky & Nature', 'てんきと しぜん'], town: ['Places, Shops & Getting There', 'まちと のりもの'],
                home: ['Home, School & Things', 'おうちと がっこう'], play: ['Play, Sport, Art & Colours', 'あそびと いろ'],
                heart: ['Heart, Ideas & Magic', 'きもちと かんがえ'],
            },
            buckets: { kana: ['kana'], point: ['point'], vmove: ['vmove'], vrest: ['vmind', 'vmake'],
                iadj: ['iadj'], naadj: ['naadj'], adverb: ['adverb', 'onoma'], say: ['phrase', 'conj'],
                numtime: ['count', 'time'], people: ['people', 'body'], animals: ['animals'], food: ['food'],
                nature: NAT, town: TOWN, home: HOME, play: PLAY, heart: HEART },
        },
        {
            year: 4, name: 'Words Get Their Real Names',
            blurb: 'Time for the real Japanese names: めいし, どうし, いけいようし, なけいようし, ふくし — and the bounciest deck on the page, オノマトペ.',
            order: ['kana', 'point', 'vmove', 'vrest', 'iadj', 'naadj', 'adverb', 'onoma', 'conj', 'say', 'numtime', 'people', 'animals', 'food', 'nature', 'town', 'home', 'play', 'heart'],
            labels: {
                kana: ['Letters · もじ', 'もじ'], point: ['Pointing & Question Words', 'こそあど・ぎもんし'],
                vmove: ['Verbs · Going & Moving', 'どうし・いく はしる'],
                vrest: ['Verbs · Making, Saying & Thinking', 'どうし・つくる いう'],
                iadj: ['い-Adjectives', 'いけいようし'], naadj: ['な-Adjectives', 'なけいようし'],
                adverb: ['Adverbs', 'ふくし'], onoma: ['Repeat & Sound Words', 'くりかえし・オノマトペ'],
                conj: ['Joining Words', 'じょし・せつぞくし'], say: ['Greetings & Set Phrases', 'あいさつ・きまりことば'],
                numtime: ['Numbers, Counters & Time', 'すうし・じょすうし'], people: ['Nouns · People, Bodies & Clothes', 'めいし・ひと'],
                animals: ['Nouns · Animals', 'めいし・どうぶつ'], food: ['Nouns · Food & Drink', 'めいし・たべもの'],
                nature: ['Nouns · Weather, Sky & Nature', 'めいし・しぜん'], town: ['Nouns · Places & Getting There', 'めいし・まち'],
                home: ['Nouns · Home, School & Things', 'めいし・もの'], play: ['Nouns · Play, Sport, Art & Colours', 'めいし・あそび'],
                heart: ['Nouns · Feelings & Ideas', 'めいし・きもち'],
            },
            buckets: { kana: ['kana'], point: ['point'], vmove: ['vmove'], vrest: ['vmind', 'vmake'],
                iadj: ['iadj'], naadj: ['naadj'], adverb: ['adverb'], onoma: ['onoma'], conj: ['conj'], say: ['phrase'],
                numtime: ['count', 'time'], people: ['people', 'body'], animals: ['animals'], food: ['food'],
                nature: NAT, town: TOWN, home: HOME, play: PLAY, heart: HEART },
        },
        {
            year: 5, name: 'The Word Family Tree',
            blurb: 'This is the whole family tree: めいし, どうし, けいようし, ふくし, じょし — every drawer knows its own name now, and the naming words are still sorted by what they mean.',
            order: ['kana', 'point', 'vmove', 'vmind', 'vmake', 'iadj', 'naadj', 'adverb', 'onoma', 'conj', 'say', 'numtime', 'people', 'animals', 'food', 'nature', 'town', 'home', 'play', 'heart'],
            labels: {
                kana: ['もじ Letters', 'かなひょう'], point: ['こそあど・ぎもんし Pointing & Question Words', 'こそあど・ぎもんし'],
                vmove: ['どうし Verbs · Going & Moving', 'どうし・いく'],
                vmind: ['どうし Verbs · Saying, Thinking & Feeling', 'どうし・おもう'],
                vmake: ['どうし Verbs · Making & Using', 'どうし・つくる'],
                iadj: ['いけいようし い-Adjectives', 'いけいようし'], naadj: ['なけいようし な-Adjectives', 'なけいようし'],
                adverb: ['ふくし Adverbs', 'ふくし'], onoma: ['オノマトペ Repeat & Sound Words', 'くりかえし'],
                conj: ['じょし・せつぞくし Particles & Joining Words', 'じょし'], say: ['あいさつ Greetings & Set Phrases', 'きまりことば'],
                numtime: ['すうし・じょすうし Numbers, Counters & Time', 'すうし'], people: ['めいし Nouns · People & Bodies', 'めいし・ひと'],
                animals: ['めいし Nouns · Animals', 'めいし・どうぶつ'], food: ['めいし Nouns · Food & Drink', 'めいし・たべもの'],
                nature: ['めいし Nouns · Weather, Sky & Nature', 'めいし・しぜん'], town: ['めいし Nouns · Places & Getting There', 'めいし・まち'],
                home: ['めいし Nouns · Home, School & Things', 'めいし・もの'], play: ['めいし Nouns · Play, Sport, Art & Colours', 'めいし・あそび'],
                heart: ['めいし Nouns · Feelings & Ideas', 'めいし・きもち'],
            },
            buckets: { kana: ['kana'], point: ['point'], vmove: ['vmove'], vmind: ['vmind'], vmake: ['vmake'],
                iadj: ['iadj'], naadj: ['naadj'], adverb: ['adverb'], onoma: ['onoma'], conj: ['conj'], say: ['phrase'],
                numtime: ['count', 'time'], people: ['people', 'body'], animals: ['animals'], food: ['food'],
                nature: NAT, town: TOWN, home: HOME, play: PLAY, heart: HEART },
        },
    ];

    // Group a list of {jp,en,pos,emoji} cards for a stage (1-5).
    // Returns [{key,label,jp,emoji,color,words}] in display order, with empty
    // drawers dropped and thin ones (1-4 cards) folded into their parent - which
    // the roll-up tree makes unambiguous. Stage-1 drawers are the root and never
    // collapse; the kana shelf is exempt from both rules.
    function groupCards(cards, stageNo) {
        const st = STAGES[Math.min(5, Math.max(1, stageNo)) - 1];
        const leafToBucket = {};
        Object.keys(st.buckets).forEach(b => st.buckets[b].forEach(l => { leafToBucket[l] = b; }));
        const bins = {};
        st.order.forEach(k => { bins[k] = []; });
        cards.forEach(c => {
            const b = leafToBucket[leafOf(c)];
            (bins[b] || (bins[b] = [])).push(c);
        });
        // A drawer holding 1-4 cards is not yet worth its own shelf. Fold it back
        // into the drawer it split out of - which means re-forming that parent
        // drawer from ALL its children, since the parent is not itself on show at
        // this stage. The split reappears by itself once the thin drawer fills up.
        const order = st.order.slice();
        const labelOf = key => {
            for (let i = st.year - 1; i >= 1; i--) {
                const p = STAGES[i - 1];
                if (p.labels[key]) return p.labels[key];
            }
            return st.labels[key] || [key, ''];
        };
        if (st.year > 1) {
            let merged = true;
            while (merged) {
                merged = false;
                // (a) parent drawer is on show -> pour the thin child straight in
                for (const k of order.slice()) {
                    if (k === 'kana' || !bins[k] || !bins[k].length || bins[k].length >= 5) continue;
                    const p = B[k] && B[k].parent;
                    if (!p || !bins[p]) continue;
                    bins[p] = bins[p].concat(bins[k]);
                    delete bins[k];
                    order.splice(order.indexOf(k), 1);
                    merged = true;
                }
                if (merged) continue;
                // (b) parent is not on show -> re-form it from all its children
                const kids = {};
                order.forEach(k => {
                    const p = B[k] && B[k].parent;
                    if (p) (kids[p] = kids[p] || []).push(k);
                });
                for (const parent of Object.keys(kids)) {
                    const group = kids[parent];
                    if (group.length < 2) continue;
                    if (!group.some(k => bins[k] && bins[k].length && bins[k].length < 5)) continue;
                    const at = order.indexOf(group[0]);
                    let all = [];
                    group.forEach(k => { all = all.concat(bins[k] || []); delete bins[k]; });
                    order.splice(at, 0, parent);
                    group.forEach(k => order.splice(order.indexOf(k), 1));
                    bins[parent] = (bins[parent] || []).concat(all);
                    merged = true;
                    break;
                }
            }
        }
        return order.filter(k => bins[k] && bins[k].length).map(k => {
            const lab = st.labels[k] || labelOf(k);
            return { key: k, label: lab[0], jp: lab[1],
                emoji: B[k].emoji, color: B[k].color, words: bins[k] };
        });
    }

    return { CATS, catMatch, catWords, leafOf, groupCards, STAGES, BUCKET: B };
})();
