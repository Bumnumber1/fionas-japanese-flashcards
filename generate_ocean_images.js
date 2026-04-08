// Generate all ocean adventure images via Stable Diffusion WebUI API
// Usage: node generate_ocean_images.js
// Requires: SD WebUI running with --api flag on localhost:7860

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'ocean_images');
const SD_API = 'http://127.0.0.1:7860';

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const BASE_POSITIVE = 'anime style, cute, digital illustration, underwater, vibrant colors, detailed, high quality, masterpiece, best quality';
const BASE_NEGATIVE = 'solid background, text, watermark, signature, blurry, low quality, worst quality, jpeg artifacts, ugly, deformed, extra limbs, bad anatomy, bad hands, missing fingers, cropped';

const images = [
    { file: 'shipwreck.png', prompt: 'old wooden sailing ship wreck on ocean floor, hull broken open, barnacles, green seaweed, small tropical fish swimming through broken windows, ships wheel, slightly eerie underwater scene' },
    { file: 'temple_ruins.png', prompt: 'ancient stone temple columns and carved blocks underwater, moss and sea vines, mysterious soft golden glow between pillars, small fish swimming around ruins, sense of wonder' },
    { file: 'sunken_village.png', prompt: 'crumbling stone cottages on sandy seafloor, sunken village, fish swimming through broken windows, coral and seaweed on rooftops, peaceful melancholy atmosphere' },
    { file: 'underwater_volcano.png', prompt: 'underwater hydrothermal vent, glowing orange red cracks in dark rock, bubbles streaming upward, pale tube worms and crabs, dramatic lighting from vent glow' },
    { file: 'whale.png', prompt: 'majestic blue whale swimming gracefully, seen from slightly below, shafts of sunlight filtering down, small fish scatter beneath, peaceful enormous whale' },
    { file: 'the_abyss.png', prompt: 'edge of dark ocean trench dropping into total blackness below, faint bioluminescent glow from deep within, rocky ledges, few brave fish peering over edge, mysterious dramatic' },
    { file: 'bioluminescent.png', prompt: 'underwater scene with thousands of tiny bioluminescent creatures glowing blue green purple, underwater starfield, glowing plankton and small jellyfish, ethereal dreamy' },
    { file: 'sea_turtle.png', prompt: 'gentle green sea turtle gliding gracefully through water, friendly wise expression, seagrass and small fish below, sunlight dappling on shell, warm peaceful' },
    { file: 'lost_anchor.png', prompt: 'massive old rusted ships anchor half buried in sand, heavy chains trailing into darkness, barnacles coral small sea creatures colonizing it, sense of history' },
    { file: 'stone_guardians.png', prompt: 'ancient carved stone faces and statues on seafloor like Easter Island heads underwater, coral and moss covering, eyes seem to watch, small fish swimming around, mysterious' },
    { file: 'jellyfish_ballet.png', prompt: 'hundreds of beautiful translucent jellyfish floating gracefully, long tendrils trailing like ribbons, glowing blue and pink bioluminescent light, ethereal balletic movement, serene' },
    { file: 'cargo_wreck.png', prompt: 'scattered old wooden cargo crates barrels and boxes half buried in sand on ocean floor, some broken open with contents spilling, crabs crawling over them' },
    { file: 'reef_shark.png', prompt: 'calm reef shark swimming lazily through water, schools of colorful small fish parting around it, shark looks sleek but not aggressive, coral reef visible below, beautiful' },
    { file: 'hydrothermal_vent.png', prompt: 'deep sea hydrothermal vent with mineral rich cloudy water billowing upward like smoke, pale blind shrimp and white crabs, strange tube worms with red tips, dark otherworldly' },
    { file: 'octopus_garden.png', prompt: 'clever purple octopus sitting in den decorated with colorful shells sea glass pottery fragments shiny stones arranged neatly, one curious intelligent eye, charming whimsical' },
    { file: 'ghost_ship.png', prompt: 'perfectly preserved old sailing ship sitting upright on ocean floor, tattered sails still raised, eerie green ghostly glow, fish swim through rigging, spooky but not terrifying' },
    { file: 'mermaid_ruins.png', prompt: 'graceful arches spiraling towers and delicate bridges made of carved coral and pearl, underwater palace for merfolk, soft pink and blue glow from within, magical beautiful' },
    { file: 'kelp_forest.png', prompt: 'towering giant kelp stalks swaying in ocean current like underwater forest, green filtered sunlight streaming through canopy, fish and sea otters swimming between fronds, serene' },
    { file: 'pirate_battle.png', prompt: 'ancient swords shields helmets and cannonballs scattered across sandy seafloor, remnants of pirate battle, coral growing on weapons, treasure chest peeking from behind rocks, adventurous' },
    { file: 'atlantean_gateway.png', prompt: 'magnificent ancient stone archway underwater, carved with mysterious symbols, golden glowing trident symbol on top, water shimmers with magical energy beyond gate, epic wondrous' },
    { file: 'pufferfish_cove.png', prompt: 'several chubby adorable pufferfish of different colors bobbing around sea anemones, one puffed up in surprise looking startled and cute, colorful coral, funny endearing' },
    { file: 'navigator_cache.png', prompt: 'stone chest on seafloor containing waterlogged old maps brass compass sextant navigation instruments from centuries ago, some maps have X marks, adventurous historical' },
    { file: 'deep_cold.png', prompt: 'extremely deep dark ice cold section of ocean, two curious seals peering from shadows with big dark eyes, ice crystals glinting in water, cold lonely atmosphere but cute seals' },
    { file: 'singing_shells.png', prompt: 'giant conch shells arranged in perfect circle on sandy seafloor, musical notes and sound waves floating from them, magical sparkles, whimsical musical' },
    { file: 'dolphin_pod.png', prompt: 'pod of playful dolphins swimming together, one doing corkscrew spin another blowing bubbles, joyful energetic, sunlight sparkles in water, happy dynamic' },
    { file: 'sunken_train.png', prompt: 'old steam locomotive and train cars on ocean floor, surreal underwater scene, fish swimming out through windows, coral on smokestack, sea plants covering wheels, whimsical surreal' },
    { file: 'crystal_cave.png', prompt: 'entrance to underwater cave with walls lined with glowing purple and blue crystals, crystals casting colored light reflections in water, small luminescent fish near entrance, magical inviting' },
    { file: 'giant_clam.png', prompt: 'enormous colorful giant clam on seafloor, shell slightly open revealing large luminous pearl inside, small curious fish peeking at pearl, vibrant blue purple mantle' },
    { file: 'submarine_wreck.png', prompt: 'old military submarine broken in half on ocean floor, rusty covered in sea growth, one or two interior lights still flickering eerily, fish swimming in and out, mysterious' },
    { file: 'treasure_minor.png', prompt: 'cracked ancient clay pot on sandy seafloor with gold coins spilling out and scattering, coins glinting sparkling, few small gems mixed in, exciting discovery' },
    { file: 'treasure_minor2.png', prompt: 'small weathered wooden treasure chest on sand, lid partially open, silver coins and few small colorful gems visible inside, pleasant find' },
    { file: 'treasure_major.png', prompt: 'ornate jewel encrusted treasure chest thrown wide open, overflowing with rubies sapphires emeralds gold necklaces diamond tiaras, golden light radiating, spectacular dazzling' },
    { file: 'treasure_major2.png', prompt: 'golden chalice jeweled necklaces gem studded rings small golden crown arranged on velvet lined ornate box on seafloor, each item sparkles, elegant precious' },
    { file: 'treasure_grand.png', prompt: 'legendary golden crown with massive glowing blue gem Heart of the Ocean, brilliant magical light beams radiating outward, crown on stone pedestal surrounded by smaller jewels, epic awe inspiring' },
    { file: 'treasure_grand_alt.png', prompt: 'magnificent golden trident weapon with large pulsing magical gem, resting on underwater altar surrounded by ancient glowing runes, pure magical power radiating, epic legendary' },
    { file: 'shark_attack.png', prompt: 'great white shark lunging forward dramatically with jaws wide open showing rows of teeth, powerful fast, motion blur on fins, scary but anime style, dramatic action' },
    { file: 'shark_circling.png', prompt: 'three menacing sharks circling in dark murky water, seen from below, ominous silhouettes against lighter water above, teeth visible, tense threatening' },
    { file: 'jellyfish_swarm.png', prompt: 'dense swarm of jellyfish with long electric stinging tendrils, glowing angry red and orange, filling the space menacingly, electric sparks between tendrils, dangerous beautiful' },
    { file: 'jellyfish_giant.png', prompt: 'one enormous jellyfish completely blocking the path, massive trailing tentacles spreading everywhere, eerie purple red glow, much bigger than a person, imposing' },
    { file: 'sea_serpent.png', prompt: 'menacing sea serpent or sea dragon emerging from dark water, scales in deep green and blue, glowing yellow eyes, long sinuous body, fins like dragon wings, ancient powerful' },
    { file: 'sea_serpent_coil.png', prompt: 'sea serpent coiled around ancient underwater ruins columns, watching with intelligent glowing eyes, long body wrapping around stone pillars, scales shimmering, mysterious guardian' },
    { file: 'whirlpool.png', prompt: 'powerful underwater whirlpool vortex with water spiraling inward, pulling in fish seaweed small debris, dark ominous center, swirling motion lines, dramatic dangerous' },
    { file: 'whirlpool_glow.png', prompt: 'magical underwater whirlpool with eerie green purple supernatural glow from center, ancient symbols swirling in vortex, otherworldly enchanted' },
    { file: 'shield_pickup.png', prompt: 'magical glowing translucent blue shield bubble floating among ancient underwater warrior ruins, shield pulses with protective energy, tiny sparkles orbiting, stone warrior statues nearby, mystical' },
    { file: 'shield_active.png', prompt: 'cute anime girl diver surrounded by glowing blue protective bubble shield, shark bouncing harmlessly off shield with flash of light, diver looks relieved and safe inside' },
    { file: 'sonar_pickup.png', prompt: 'sleek high tech sonar device sitting on rock underwater, circular sonar ping waves radiating outward, small LED lights glowing, advanced useful device' },
    { file: 'sonar_active.png', prompt: 'expanding circular sonar pulse rings radiating through water, revealing hidden outlines of treasure chests fish and dangers in the rings, green tinted sonar display style' },
    { file: 'diving_bell.png', prompt: 'beautiful ornate golden diving bell hanging from thick chains, warm golden glow inside, bubbles rising, looks like safety and salvation, warm inviting' },
    { file: 'diver_descend.png', prompt: 'cute anime young girl Yuna about 10 years old in diving suit descending into deep blue water, sunlight shafts from above, brave excited expression, air bubbles trailing, dark pigtails hair' },
    { file: 'diver_swim.png', prompt: 'cute anime girl diver Yuna swimming forward through ocean holding waterproof flashlight, beam illuminates path ahead, small fish alongside, determined adventurous expression' },
    { file: 'diver_victory.png', prompt: 'cute anime girl diver Yuna celebrating underwater, holding up golden treasure with both hands, huge smile, colorful fish swimming around in celebration, sparkles and light rays' },
    { file: 'game_start.png', prompt: 'ocean surface from above with brilliant sunlight, small wooden boat, cute anime girl Yuna standing on edge about to dive in, crystal blue water fading to deep dark blue below, exciting adventure beginning' },
    { file: 'game_over.png', prompt: 'cute anime girl diver Yuna floating upward toward surface looking tired and sad, flashlight dimming, shark silhouettes circling below in dark water, disappointed but okay' },
    { file: 'victory_surface.png', prompt: 'cute anime girl Yuna breaking through ocean surface triumphantly, holding treasure chest above head, beautiful sunset sky orange pink clouds, boat nearby, dolphins jumping background, celebration joy' },
    { file: 'danger_nearby.png', prompt: 'dark murky underwater scene with ominous large shadow silhouette barely visible in cloudy water ahead, could be shark or serpent, tense foreboding atmosphere, red warning tint' },
    { file: 'shield_block.png', prompt: 'magical shield shattering into brilliant sparkling fragments blocking shark attack, impact creates flash of bright blue white light, dramatic action packed, diver safe behind shield' },
    { file: 'map_overview.png', prompt: 'stylized old parchment treasure map with hand drawn ocean features, sea creatures compass rose dotted paths X marks skull and crossbones, aged weathered, adventurous' },
    { file: 'compass_rose.png', prompt: 'beautiful ornate compass rose with N S E W marked, underwater nautical theme with coral and shell decorations, needle points north, golden bronze metallic look' },
    { file: 'depth_meter.png', prompt: 'steampunk style brass depth gauge with round dial needle pressure markings, small bubbles around it, pipes and gears, diving equipment aesthetic' },
];

async function generateImage(item, index, total) {
    const prompt = `${item.prompt}, ${BASE_POSITIVE}`;
    const outputPath = path.join(OUTPUT_DIR, item.file);

    if (fs.existsSync(outputPath)) {
        console.log(`[${index + 1}/${total}] SKIP ${item.file} (already exists)`);
        return true;
    }

    console.log(`[${index + 1}/${total}] Generating ${item.file}...`);

    const payload = {
        prompt: prompt,
        negative_prompt: BASE_NEGATIVE,
        width: 600,
        height: 400,
        steps: 25,
        cfg_scale: 7,
        sampler_name: 'DPM++ 2M Karras',
        batch_size: 1,
        n_iter: 1,
    };

    try {
        const res = await fetch(`${SD_API}/sdapi/v1/txt2img`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(600000),
        });

        const json = await res.json();

        if (json.images && json.images.length > 0) {
            const imgBuffer = Buffer.from(json.images[0], 'base64');
            fs.writeFileSync(outputPath, imgBuffer);
            console.log(`[${index + 1}/${total}] SAVED ${item.file} (${(imgBuffer.length / 1024).toFixed(0)} KB)`);
            return true;
        } else {
            console.log(`[${index + 1}/${total}] ERROR ${item.file}: No image in response`);
            return false;
        }
    } catch (e) {
        console.log(`[${index + 1}/${total}] ERROR ${item.file}: ${e.message}`);
        return false;
    }
}

async function main() {
    try {
        await fetch(`${SD_API}/sdapi/v1/sd-models`, { signal: AbortSignal.timeout(5000) });
    } catch (e) {
        console.error('ERROR: Cannot connect to SD WebUI API at ' + SD_API);
        process.exit(1);
    }

    console.log(`\n=== Ocean Adventure Image Generator ===`);
    console.log(`Output: ${OUTPUT_DIR}`);
    console.log(`Images to generate: ${images.length}\n`);

    const startTime = Date.now();
    let success = 0, fail = 0, skip = 0;

    for (let i = 0; i < images.length; i++) {
        const result = await generateImage(images[i], i, images.length);
        if (result && fs.existsSync(path.join(OUTPUT_DIR, images[i].file))) {
            success++;
        } else if (result) {
            skip++;
        } else {
            fail++;
        }
    }

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`\n=== Done in ${elapsed} minutes ===`);
    console.log(`Success: ${success} | Skipped: ${skip} | Failed: ${fail}`);
}

main().catch(console.error);
