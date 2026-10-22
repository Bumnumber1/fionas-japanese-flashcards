/*
 * Japanese reading for the dojo. Uses the same browser speech infrastructure as
 * voicepractice.html and activities.js, with exact whole-answer comparisons.
 * Call start(question) from a user click. There is no typed/self-certified path.
 * Browser vendors may process microphone audio with their network speech service.
 * API reference: https://webaudio.github.io/web-speech-api/#speechreco-section
 */
(function (global) {
    'use strict';

    const KANA = [
        ['あ', 'a'], ['い', 'i'], ['う', 'u'], ['え', 'e'], ['お', 'o'],
        ['か', 'ka'], ['き', 'ki'], ['く', 'ku'], ['け', 'ke'], ['こ', 'ko'],
        ['さ', 'sa'], ['し', 'shi'], ['す', 'su'], ['せ', 'se'], ['そ', 'so'],
        ['た', 'ta'], ['ち', 'chi'], ['つ', 'tsu'], ['て', 'te'], ['と', 'to'],
        ['な', 'na'], ['に', 'ni'], ['ぬ', 'nu'], ['ね', 'ne'], ['の', 'no'],
        ['は', 'ha'], ['ひ', 'hi'], ['ふ', 'fu'], ['へ', 'he'], ['ほ', 'ho'],
        ['ま', 'ma'], ['み', 'mi'], ['む', 'mu'], ['め', 'me'], ['も', 'mo'],
        ['や', 'ya'], ['ゆ', 'yu'], ['よ', 'yo'],
        ['ら', 'ra'], ['り', 'ri'], ['る', 'ru'], ['れ', 're'], ['ろ', 'ro'],
        ['わ', 'wa'], ['を', 'wo'], ['ん', 'n']
    ];
    const ROMAJI = Object.fromEntries(KANA.map(([kana, roman]) => [roman, kana]));
    Object.assign(ROMAJI, {
        si: 'し', ti: 'ち', tu: 'つ', hu: 'ふ', zi: 'じ', ji: 'じ',
        ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
        za: 'ざ', zu: 'ず', ze: 'ぜ', zo: 'ぞ', da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
        ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ', pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
        kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ', gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
        sha: 'しゃ', shu: 'しゅ', sho: 'しょ', sya: 'しゃ', syu: 'しゅ', syo: 'しょ',
        cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ', tya: 'ちゃ', tyu: 'ちゅ', tyo: 'ちょ',
        ja: 'じゃ', ju: 'じゅ', jo: 'じょ', jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ',
        nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ', hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ',
        bya: 'びゃ', byu: 'びゅ', byo: 'びょ', pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
        mya: 'みゃ', myu: 'みゅ', myo: 'みょ', rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ'
    });

    // Exact orthography aliases for the canonical Year 1 vocabulary. The first
    // fifteen nature forms agree with garden-material.js; animal/body/place
    // forms also occur in kanjiride.html, and 本/猫/学校 in voicepractice.html.
    // An alias applies ONLY to its complete expected word, never to substrings.
    const WORD_FORMS = {
        'たなばた': ['七夕'], 'ほし': ['星'], 'ねがいごと': ['願い事', '願いごと'],
        'たんざく': ['短冊'], 'ささ': ['笹'], 'おりひめ': ['織姫'], 'ひこぼし': ['彦星'],
        'どうぶつ': ['動物'], 'ぞう': ['象'], 'きりん': ['麒麟'], 'さる': ['猿'],
        'うさぎ': ['兎'], 'とら': ['虎'], 'くま': ['熊'], 'かば': ['河馬'], 'ひつじ': ['羊'],
        'つくえ': ['机'], 'いす': ['椅子'], 'はさみ': ['鋏'], 'のり': ['糊'],
        'じょうぎ': ['定規'], 'ふでばこ': ['筆箱', '筆ばこ'], 'こくばん': ['黒板'],
        'きょうかしょ': ['教科書'], 'くだもの': ['果物'], 'もも': ['桃'], 'ぶどう': ['葡萄'],
        'すいか': ['西瓜'], 'なし': ['梨'], 'みかん': ['蜜柑'], 'さくらんぼ': ['桜桃'], 'かき': ['柿'],
        'やさい': ['野菜'], 'にんじん': ['人参'], 'じゃがいも': ['じゃが芋'],
        'たまねぎ': ['玉ねぎ', '玉葱'], 'きゅうり': ['胡瓜'], 'なす': ['茄子'],
        'だいこん': ['大根'], 'ほうれんそう': ['ほうれん草'],
        'だいすき': ['大好き'], 'だいきらい': ['大嫌い'], 'こうえん': ['公園'],
        'すべりだい': ['滑り台'], 'すなば': ['砂場'], 'てつぼう': ['鉄棒'],
        'なわとび': ['縄跳び', '縄飛び'], 'かけっこ': ['駆けっこ'], 'おにごっこ': ['鬼ごっこ'],
        'きんいろ': ['金色'], 'ぎんいろ': ['銀色'], 'みずいろ': ['水色'], 'ももいろ': ['桃色'],
        'にじ': ['虹'], 'あかるい': ['明るい'], 'くらい': ['暗い'], 'へや': ['部屋'],
        'まど': ['窓'], 'とけい': ['時計'], 'でんき': ['電気'], 'ふとん': ['布団'],
        'まくら': ['枕'], 'たな': ['棚'], 'ぬいぐるみ': ['縫いぐるみ'],
        'おつきみ': ['お月見'], 'つき': ['月'], 'まんげつ': ['満月'], 'よる': ['夜'],
        'すすき': ['芒'], 'ほしぞら': ['星空'], 'やま': ['山'], 'かわ': ['川'],
        'もり': ['森'], 'いけ': ['池'], 'いし': ['石'], 'き': ['木'], 'くさ': ['草'],
        'つち': ['土'], 'うみ': ['海'], 'さかな': ['魚'], 'たこ': ['蛸'], 'いか': ['烏賊'],
        'かに': ['蟹'], 'かめ': ['亀'], 'さめ': ['鮫'], 'くじら': ['鯨'],
        'すごい': ['凄い'], 'きょう': ['今日'], 'ねこ': ['猫'], 'わたし': ['私'],
        'おおきい': ['大きい'], 'ほん': ['本'], 'たべます': ['食べます'],
        'のみます': ['飲みます'], 'みます': ['見ます', '観ます'], 'よみます': ['読みます'],
        'かいます': ['買います'], 'すき': ['好き'], 'きらい': ['嫌い'], 'ほしい': ['欲しい'],
        'いちご': ['苺'], 'りんご': ['林檎'], 'いきます': ['行きます'], 'きます': ['来ます'],
        'ねます': ['寝ます'], 'あそびます': ['遊びます'], 'およぎます': ['泳ぎます'],
        'ともだち': ['友達', '友だち'], 'あかい': ['赤い'], 'きれい': ['綺麗'],
        'はな': ['花'], 'みどり': ['緑'], 'かばん': ['鞄'], 'せんせい': ['先生'], 'おもい': ['重い'],
        'がっこう': ['学校'], 'いぬ': ['犬']
    };

    // A recognizer can choose a short kanji homophone for an isolated syllable.
    // These explicit whole-result aliases never rewrite arbitrary Japanese text.
    const KANA_FORMS = {
        'い': ['胃'], 'う': ['鵜'], 'え': ['絵'], 'お': ['尾'], 'か': ['蚊', '課', '科', '火'],
        'き': ['木', '気'], 'く': ['区', '句'], 'け': ['毛'], 'こ': ['子', '個'],
        'さ': ['差'], 'し': ['詩', '市', '氏', '四'], 'す': ['酢', '巣'], 'せ': ['背'],
        'た': ['田', '多', '他'], 'ち': ['地', '血'], 'つ': ['津'], 'て': ['手'], 'と': ['戸', '都'],
        'な': ['名', '菜'], 'に': ['二', '荷'], 'ね': ['根'], 'の': ['野'], 'は': ['葉', '歯'],
        'ひ': ['日', '火'], 'ふ': ['府', '負'], 'ほ': ['穂'], 'ま': ['間', '真'], 'み': ['実', '身'],
        'む': ['無'], 'め': ['目', '芽'], 'や': ['矢'], 'ゆ': ['湯'], 'よ': ['世', '夜'],
        'り': ['理', '利'], 'ろ': ['炉'], 'わ': ['輪', '和'], 'を': ['お', '尾']
    };

    function normalizeTranscript(value) {
        return String(value == null ? '' : value).normalize('NFKC').toLowerCase()
            .replace(/[ァ-ヶ]/g, character => String.fromCharCode(character.charCodeAt(0) - 0x60))
            .replace(/[\p{P}\p{Z}\s]/gu, '');
    }

    function romajiToKana(value) {
        let roman = String(value || '').normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'")
            .replace(/ā/g, 'aa').replace(/ī/g, 'ii').replace(/ū/g, 'uu').replace(/ē/g, 'ee').replace(/ō/g, 'ou')
            .replace(/[\p{P}\p{Z}\s]/gu, character => character === "'" ? character : '');
        if (!/^[a-z']+$/.test(roman)) return '';
        let kana = '';
        while (roman) {
            if (roman.startsWith("n'")) { kana += 'ん'; roman = roman.slice(2); continue; }
            if (roman === 'nn') { kana += 'ん'; break; }
            if (roman[0] === 'n' && (roman.length === 1 || !/[aeiouy]/.test(roman[1]))) {
                kana += 'ん'; roman = roman.slice(1); continue;
            }
            if (roman.length > 1 && roman[0] === roman[1] && /[bcdfghjkmprstvwz]/.test(roman[0])) {
                kana += 'っ'; roman = roman.slice(1); continue;
            }
            let found = false;
            for (const length of [3, 2, 1]) {
                const syllable = roman.slice(0, length);
                if (!Object.prototype.hasOwnProperty.call(ROMAJI, syllable)) continue;
                kana += ROMAJI[syllable]; roman = roman.slice(syllable.length); found = true; break;
            }
            if (!found) return '';
        }
        return kana;
    }

    function romanSignature(value) {
        const roman = normalizeTranscript(value);
        if (!/^[a-zāīūēō]+$/.test(roman)) return '';
        return roman.replace(/ou|oo/g, 'ō').replace(/uu/g, 'ū').replace(/aa/g, 'ā').replace(/ii/g, 'ī').replace(/ee/g, 'ē');
    }

    function aliasesFor(question) {
        if (!question || !['kana-read', 'word-read'].includes(question.mode)) return [];
        const expected = question.mode === 'kana-read' ? question.prompt : (question.expectedKana || question.promptJapanese || question.prompt);
        // The display script never changes a sound: both Hiragana and Katakana
        // prompts use these exact normalized aliases, including halfwidth input.
        const normalized = normalizeTranscript(expected);
        if (!normalized) return [];
        const aliases = new Set([normalized]);
        const add = value => { const alias = normalizeTranscript(value); if (alias) aliases.add(alias); };
        const roman = question.reading || (question.mode === 'kana-read' && (KANA.find(([kana]) => kana === normalized) || [])[1]);
        if (roman) {
            add(roman);
            add(romajiToKana(roman));
            // Preserve long vowels while recognizing standard macron notation.
            add(romanSignature(roman));
        }
        // Reading specials can use a whole kana word before the word-reading
        // belts. Apply only that complete word's orthography aliases; isolated
        // kana keep their existing syllable homophones and pronunciation rules.
        const isolatedKana = question.mode === 'kana-read' && [...normalized].length === 1;
        const forms = isolatedKana ? KANA_FORMS[normalized] : WORD_FORMS[normalized];
        if (forms) forms.forEach(add);
        if (question.mode === 'kana-read' && normalized === 'を') add('o');
        if (question.mode === 'kana-read' && normalized === 'ん') { add('nn'); add("n'"); }
        if (Array.isArray(question.voiceAliases)) question.voiceAliases.filter(value => typeof value === 'string').forEach(add);
        return [...aliases];
    }

    function matches(question, transcript) {
        const normalized = normalizeTranscript(transcript);
        if (!normalized) return false;
        const aliases = aliasesFor(question);
        return aliases.includes(normalized) || aliases.includes(romajiToKana(transcript)) || aliases.includes(romanSignature(transcript));
    }

    const ERROR_MESSAGES = {
        unsupported: 'This browser cannot recognize Japanese speech. Open the game in a browser with Web Speech recognition, such as Chrome or Edge, using localhost or HTTPS. Reading fights require a microphone and recognized speech.',
        'not-allowed': 'Microphone permission was blocked. Allow microphone access for this site in your browser, then tap Speak again. No health was lost.',
        'service-not-allowed': 'The browser blocked its speech service. Enable speech recognition or try another supported browser. No health was lost.',
        'audio-capture': 'The microphone is unavailable. Connect or select a microphone in your browser settings, then try again. No health was lost.',
        network: 'The browser could not reach its speech service. Check your connection and try again. No health was lost.',
        'no-speech': 'No clear speech was heard. Tap Speak and say the whole Japanese answer near your microphone. No health was lost.',
        'no-match': 'The browser could not confidently recognize that speech. Tap Speak and try once more. No health was lost.',
        'language-not-supported': 'This browser speech service does not support Japanese. Try another browser or install its Japanese speech support. No health was lost.',
        'recognition-timeout': 'The speech service did not finish. Tap Speak to retry; no health was lost.',
        aborted: 'Listening was interrupted. Tap Speak when you are ready. No health was lost.',
        'invalid-question': 'This activity is not a Japanese reading question. Choose a reading fight to use the microphone.',
        'recognition-error': 'Speech recognition could not start. Check the browser microphone permission and speech settings, then retry. No health was lost.'
    };

    class DojoVoice {
        constructor(options) {
            options = options || {};
            this.onState = typeof options.onState === 'function' ? options.onState : null;
            this.onResult = typeof options.onResult === 'function' ? options.onResult : null;
            this.onError = typeof options.onError === 'function' ? options.onError : null;
            this.supported = Boolean(global.SpeechRecognition || global.webkitSpeechRecognition) && global.isSecureContext !== false;
            this.session = null;
            this.generation = 0;
            this.destroyed = false;
            this.pageHide = () => this.cancel();
            this.visibilityChange = () => { if (global.document && global.document.hidden) this.cancel(); };
            if (global.addEventListener) global.addEventListener('pagehide', this.pageHide);
            if (global.document && global.document.addEventListener) global.document.addEventListener('visibilitychange', this.visibilityChange);
        }

        static normalizeTranscript(value) { return normalizeTranscript(value); }
        static aliasesFor(question) { return aliasesFor(question); }
        static matches(question, transcript) { return matches(question, transcript); }

        emitState(status, transcript) {
            if (!this.destroyed && this.onState) this.onState(transcript === undefined ? { status } : { status, transcript });
        }

        emitError(code) {
            if (!this.destroyed && this.onError) this.onError({ code, message: ERROR_MESSAGES[code] || ERROR_MESSAGES['recognition-error'] });
        }

        current(session) { return !this.destroyed && this.session === session && !session.settled; }

        dispose(session, abort) {
            session.settled = true;
            for (const timer of [session.startTimer, session.recordTimer, session.processTimer]) if (timer != null) global.clearTimeout(timer);
            for (const event of ['onstart', 'onresult', 'onerror', 'onend', 'onnomatch', 'onspeechend', 'onaudioend']) session.rec[event] = null;
            if (this.session === session) this.session = null;
            if (abort) { try { session.rec.abort(); } catch (_) { try { session.rec.stop(); } catch (_) {} } }
        }

        fail(session, code) {
            if (!this.current(session)) return;
            this.dispose(session, true);
            this.emitState('idle');
            if (this.generation === session.generation) this.emitError(code);
        }

        start(question) {
            if (this.destroyed) return false;
            this.cancel();
            if (!this.supported) { this.emitError('unsupported'); return false; }
            if (!aliasesFor(question).length) { this.emitError('invalid-question'); return false; }
            const Recognition = global.SpeechRecognition || global.webkitSpeechRecognition;
            let rec;
            try { rec = new Recognition(); } catch (_) { this.emitError('recognition-error'); return false; }
            // Snapshot the target: mutating/navigating the controller cannot turn
            // speech from the previous activity into a new activity's answer.
            const target = Object.assign({}, question, { voiceAliases: Array.isArray(question.voiceAliases) ? question.voiceAliases.slice() : [] });
            const session = { rec, target, generation: this.generation, settled: false, stopping: false, interim: '' };
            this.session = session;
            rec.lang = 'ja-JP';
            rec.interimResults = true;
            rec.continuous = false;
            rec.maxAlternatives = 5;
            rec.onstart = () => {
                if (!this.current(session)) return;
                global.clearTimeout(session.startTimer);
                global.clearTimeout(session.recordTimer);
                session.recordTimer = global.setTimeout(() => { if (this.current(session)) this.stop(); }, 10000);
                this.emitState('listening');
            };
            rec.onresult = event => {
                if (!this.current(session)) return;
                const groups = [];
                const interim = [];
                for (let index = 0; index < event.results.length; index++) {
                    const result = event.results[index];
                    if (!result || !result.length) continue;
                    if (!result.isFinal) { if (result[0] && result[0].transcript) interim.push(result[0].transcript); continue; }
                    const alternatives = [];
                    for (let alternative = 0; alternative < Math.min(5, result.length); alternative++) {
                        if (result[alternative] && typeof result[alternative].transcript === 'string') alternatives.push(result[alternative].transcript.trim());
                    }
                    if (alternatives.length) groups.push(alternatives);
                }
                if (!groups.length) {
                    session.interim = interim.join(' ').trim();
                    this.emitState(session.stopping ? 'processing' : 'listening', session.interim);
                    return;
                }
                // Non-continuous recognition normally has one final group. If a
                // vendor emits several, grade complete joined hypotheses only.
                let alternatives = [''];
                for (const group of groups) alternatives = alternatives.flatMap(prefix => group.map(text => (prefix + ' ' + text).trim())).slice(0, 25);
                alternatives = [...new Set(alternatives.filter(text => normalizeTranscript(text)))];
                if (!alternatives.length) { this.fail(session, 'no-speech'); return; }
                const matched = alternatives.find(transcript => matches(target, transcript));
                const transcript = matched === undefined ? alternatives[0] : matched;
                const result = { correct: matched !== undefined, transcript, alternatives, normalized: normalizeTranscript(transcript) };
                this.dispose(session, true);
                this.emitState('idle', transcript);
                if (!this.destroyed && this.generation === session.generation && this.onResult) this.onResult(result);
            };
            rec.onerror = event => this.fail(session, event && event.error ? event.error : 'recognition-error');
            rec.onnomatch = () => this.fail(session, 'no-match');
            rec.onend = () => this.fail(session, session.interim ? 'recognition-timeout' : 'no-speech');
            rec.onspeechend = () => { if (this.current(session)) this.stop(); };
            rec.onaudioend = () => { if (this.current(session) && !session.stopping) this.stop(); };
            // Cancel target audio first, as in activities.js. The app must never
            // earn a hit by recognizing its own speech synthesis.
            try { if (global.speechSynthesis) global.speechSynthesis.cancel(); } catch (_) {}
            this.emitState('listening');
            if (!this.current(session)) return false;
            session.startTimer = global.setTimeout(() => this.fail(session, 'recognition-timeout'), 15000);
            try { rec.start(); return true; }
            catch (error) { this.fail(session, error && error.name === 'NotAllowedError' ? 'not-allowed' : 'recognition-error'); return false; }
        }

        stop() {
            const session = this.session;
            if (!session || !this.current(session)) return false;
            if (session.stopping) return true;
            session.stopping = true;
            global.clearTimeout(session.startTimer);
            global.clearTimeout(session.recordTimer);
            this.emitState('processing', session.interim);
            if (!this.current(session)) return false;
            session.processTimer = global.setTimeout(() => this.fail(session, session.interim ? 'recognition-timeout' : 'no-speech'), 3000);
            try { session.rec.stop(); } catch (_) { this.fail(session, 'recognition-error'); }
            return true;
        }

        cancel() {
            this.generation++;
            const session = this.session;
            if (session) this.dispose(session, true);
            this.emitState('idle');
        }

        destroy() {
            if (this.destroyed) return;
            this.destroyed = true;
            this.generation++;
            if (this.session) this.dispose(this.session, true);
            if (global.removeEventListener) global.removeEventListener('pagehide', this.pageHide);
            if (global.document && global.document.removeEventListener) global.document.removeEventListener('visibilitychange', this.visibilityChange);
            this.onState = this.onResult = this.onError = null;
        }
    }

    global.DojoVoice = DojoVoice;
    if (typeof module !== 'undefined' && module.exports) module.exports = DojoVoice;
})(typeof window !== 'undefined' ? window : globalThis);
