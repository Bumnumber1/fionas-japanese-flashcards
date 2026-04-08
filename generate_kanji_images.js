// Generate kanji-themed underwater images via Stable Diffusion WebUI API
// Usage: node generate_kanji_images.js
// Requires: SD WebUI running with --api flag on localhost:7860

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'ocean_images');
const SD_API = 'http://127.0.0.1:7860';

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const BASE_POSITIVE = 'anime style, cute, digital illustration, underwater, sunken, vibrant colors, detailed, high quality, masterpiece, best quality, ocean floor';
const BASE_NEGATIVE = 'text, watermark, signature, blurry, low quality, worst quality, jpeg artifacts, ugly, deformed, extra limbs, bad anatomy, bad hands, missing fingers, cropped, letters, words, kanji, writing';

const images = [
    // --- Numbers (sunken counting objects) ---
    { file: 'kanji_one.png', prompt: 'a single beautiful sunken golden coin standing upright on sandy ocean floor, one coin, glowing softly, small fish nearby' },
    { file: 'kanji_two.png', prompt: 'two matching ancient amphora vases side by side on the ocean floor, covered in coral, pair of clay pots underwater' },
    { file: 'kanji_three.png', prompt: 'three glowing sea lanterns in a row on the ocean floor, trio of magical underwater lights, warm glow' },
    { file: 'kanji_four.png', prompt: 'four colorful starfish arranged in a square pattern on sandy ocean floor, red orange purple blue starfish' },
    { file: 'kanji_five.png', prompt: 'five beautiful seashells of different types arranged in a circle on the ocean floor, conch scallop spiral shells' },
    { file: 'kanji_six.png', prompt: 'six pearls floating in a gentle arc underwater, luminous white pearls glowing, magical underwater scene' },
    { file: 'kanji_seven.png', prompt: 'seven colorful tropical fish swimming in formation underwater, rainbow of fish colors, playful school of fish' },
    { file: 'kanji_eight.png', prompt: 'eight tentacles of a friendly octopus spread out like a star on the ocean floor, cute purple octopus' },
    { file: 'kanji_nine.png', prompt: 'nine glowing jellyfish floating in a group underwater, soft bioluminescent light, ethereal jellyfish cluster' },
    { file: 'kanji_ten.png', prompt: 'sunken treasure chest overflowing with exactly ten large gold coins scattered on sandy ocean floor, sparkling treasure' },

    // --- Nature ---
    { file: 'kanji_mountain.png', prompt: 'underwater mountain peak rising from the ocean floor, seamount covered in coral and sea life, majestic underwater ridge' },
    { file: 'kanji_river.png', prompt: 'underwater river of denser salt water flowing along ocean floor, brine river underwater, strange current with different colored water' },
    { file: 'kanji_flower.png', prompt: 'beautiful sea anemones blooming like underwater flowers, colorful pink purple orange anemone garden on coral reef' },
    { file: 'kanji_rain.png', prompt: 'marine snow falling through deep water like underwater rain, particles drifting down through blue water, gentle underwater snowfall' },
    { file: 'kanji_sky.png', prompt: 'view looking up from deep underwater toward the bright ocean surface, sunlight streaming down through blue water, heavenly light above' },
    { file: 'kanji_heaven.png', prompt: 'magnificent underwater cathedral of light, sunbeams piercing through water creating pillars of golden light, divine ethereal underwater scene' },
    { file: 'kanji_stone.png', prompt: 'ancient carved stone tablet with mysterious symbols resting on ocean floor, moss-covered sacred stone underwater, weathered relic' },
    { file: 'kanji_ricefield.png', prompt: 'underwater seagrass meadow in neat rows like a rice paddy, orderly sea grass beds on sandy floor, green underwater field' },

    // --- People ---
    { file: 'kanji_person.png', prompt: 'ancient sunken statue of a person standing on the ocean floor, stone human figure covered in coral and barnacles, serene expression' },
    { file: 'kanji_child.png', prompt: 'cute small stone cherub statue on ocean floor, baby angel figure covered in colorful coral, adorable sunken sculpture' },
    { file: 'kanji_woman.png', prompt: 'elegant sunken marble statue of a goddess or mermaid on ocean floor, graceful female figure draped in flowing stone robes, coral crown' },
    { file: 'kanji_man.png', prompt: 'sunken bronze statue of a warrior or samurai standing proud on ocean floor, strong male figure with armor, barnacle-covered' },
    { file: 'kanji_king.png', prompt: 'ornate golden crown sitting on a stone pedestal on the ocean floor, jeweled royal crown underwater, regal and majestic' },
    { file: 'kanji_life.png', prompt: 'vibrant coral reef teeming with life, baby sea creatures hatching, new growth on coral, tiny seahorses and small fish, circle of life underwater' },
    { file: 'kanji_study.png', prompt: 'sunken stack of waterlogged ancient books and scrolls on the ocean floor, open book with pages floating, underwater library ruins' },

    // --- Body parts ---
    { file: 'kanji_eye.png', prompt: 'ancient carved stone eye symbol embedded in underwater temple wall, mystical all-seeing eye relic, glowing pupil, mysterious' },
    { file: 'kanji_ear.png', prompt: 'giant beautiful ear-shaped seashell on the ocean floor, abalone shell that looks like an ear, iridescent nacre interior' },
    { file: 'kanji_mouth.png', prompt: 'underwater cave entrance shaped like an open mouth in a rocky cliff, fish swimming in and out, mysterious cavern opening' },
    { file: 'kanji_hand.png', prompt: 'sunken stone hand reaching up from the sandy ocean floor, ancient sculpture of an open hand, coral growing on fingers' },
    { file: 'kanji_foot.png', prompt: 'giant ancient stone footprint impression in the ocean floor rock, mysterious fossilized footstep underwater, moss and small creatures inside' },

    // --- Concepts ---
    { file: 'kanji_power.png', prompt: 'sunken anchor with massive chain pulled taut, showing immense strength and power, dramatic underwater scene, strong currents swirling' },
    { file: 'kanji_up.png', prompt: 'stream of silver air bubbles rising upward through blue water toward bright surface light, ascending bubbles, upward movement' },
    { file: 'kanji_down.png', prompt: 'heavy sunken iron weight sinking down into dark ocean abyss, descending into darkness, downward pull, deep water' },
    { file: 'kanji_big.png', prompt: 'enormous sunken stone head like Easter Island moai but underwater, massive ancient sculpture dwarfing small fish around it, huge monument' },
    { file: 'kanji_middle.png', prompt: 'beautiful glowing pearl floating in the exact center of an open giant clam shell, centered perfectly, balanced composition underwater' },
    { file: 'kanji_small.png', prompt: 'tiny cute seahorse hiding among delicate coral branches, miniature sea creature, small and precious, detailed macro underwater view' },
    { file: 'kanji_enter.png', prompt: 'inviting underwater cave entrance with warm golden light glowing from inside, beckoning opening in reef wall, welcoming doorway' },
    { file: 'kanji_exit.png', prompt: 'underwater tunnel opening showing bright blue open water beyond, exit from dark cave into light, fish swimming out toward freedom' },

    // --- Time/celestial ---
    { file: 'kanji_day.png', prompt: 'brilliant sunlight penetrating ocean surface creating golden rays underwater, bright daytime underwater scene, warm light flooding the depths' },
    { file: 'kanji_moon.png', prompt: 'moonlight filtering through ocean surface at night, silvery lunar glow illuminating underwater scene, peaceful nocturnal ocean' },
    { file: 'kanji_fire.png', prompt: 'underwater volcanic vent with glowing red magma and fire-like eruption on ocean floor, hydrothermal fire, orange red glow in dark water' },
    { file: 'kanji_water.png', prompt: 'crystal clear pristine underwater scene with beautiful water currents visible, pure blue water with dancing light patterns, essence of water' },
    { file: 'kanji_tree.png', prompt: 'tall branching coral formation that looks like an underwater tree, tree-shaped coral with spreading branches, fish like birds in its canopy' },
    { file: 'kanji_gold.png', prompt: 'pile of sunken gold bars and gold coins glittering on the ocean floor, treasure hoard of gold, warm golden gleam underwater' },
    { file: 'kanji_earth.png', prompt: 'rich ocean floor sediment and sand with layers of earth visible in underwater cliff face, geological strata, minerals and fossils exposed' },

    // --- Objects ---
    { file: 'kanji_book.png', prompt: 'beautiful old leather-bound book lying open on the ocean floor, waterlogged pages gently floating, sunken ancient tome, magical glow' },
    { file: 'kanji_dog.png', prompt: 'cute stone statue of a loyal dog sitting on the ocean floor, Hachiko-style faithful dog sculpture sunken underwater, coral-covered' },
    { file: 'kanji_shellfish.png', prompt: 'magnificent giant colorful seashell collection on the ocean floor, variety of beautiful shells and mollusks, nacre and pearl colors' },
    { file: 'kanji_car.png', prompt: 'old vintage car sunken on the ocean floor covered in coral and sea life, fish swimming through windows, surreal underwater wreck' },
    { file: 'kanji_red.png', prompt: 'vibrant red coral reef formation underwater, bright crimson and scarlet sea fans and soft corals, deep red color dominating the scene' },
    { file: 'kanji_blue.png', prompt: 'deep pure blue ocean water scene with blue tang fish and blue starfish, sapphire blue underwater world, everything in shades of blue' },
    { file: 'kanji_white.png', prompt: 'pure white sand ocean floor with white coral and pale ghost fish, albino sea creatures, pristine white underwater landscape, ethereal' },
    { file: 'kanji_see.png', prompt: 'ancient underwater telescope or spyglass resting on ocean floor, brass viewing instrument covered in patina, lens catching light' },

    // --- 2nd Grade ---
    { file: 'kanji_sea.png', prompt: 'vast panoramic underwater ocean vista, endless blue water stretching in every direction, the immense beauty of the deep sea, awe-inspiring' },
    { file: 'kanji_fish.png', prompt: 'gorgeous large tropical fish swimming directly toward viewer, detailed scales and fins, beautiful angelfish or butterflyfish, face to face underwater' },
    { file: 'kanji_ship.png', prompt: 'majestic sunken wooden sailing ship on ocean floor, intact hull with masts still standing, beautiful old galleon wreck underwater' },
    { file: 'kanji_light.png', prompt: 'shaft of brilliant light piercing through dark water, single dramatic light beam illuminating particles in the water, spotlight from above' },
    { file: 'kanji_star.png', prompt: 'cluster of colorful starfish arranged like a constellation on the ocean floor, star-shaped sea creatures forming a pattern, glowing slightly' },
    { file: 'kanji_wind.png', prompt: 'strong underwater current sweeping seaweed and small fish sideways, powerful ocean current visible by bending kelp, dynamic water movement' },
    { file: 'kanji_snow.png', prompt: 'marine snow falling heavily through cold dark deep water, white particles drifting down like a blizzard underwater, cold blue tones' },
    { file: 'kanji_cloud.png', prompt: 'billowing underwater sand cloud stirred up from the ocean floor, cloud-like formation of sediment suspended in water, soft and fluffy looking' },
    { file: 'kanji_strong.png', prompt: 'powerful great white shark swimming with incredible strength and muscle, apex predator showing raw power underwater, impressive and mighty' },
    { file: 'kanji_weak.png', prompt: 'tiny fragile transparent glass shrimp on delicate sea fan coral, delicate vulnerable small creature, gentle and fragile underwater' },
    { file: 'kanji_run.png', prompt: 'school of fast fish darting and rushing through the water at high speed, motion blur, swift underwater chase scene, dynamic movement' },
    { file: 'kanji_stop.png', prompt: 'ancient sunken stone barrier or wall blocking an underwater passage, stop sign carved in stone, immovable underwater obstacle' },
    { file: 'kanji_eat.png', prompt: 'large fish about to eat smaller fish, ocean food chain moment, open mouth approaching prey, underwater feeding scene, natural and cute' },
    { file: 'kanji_heart.png', prompt: 'heart-shaped coral formation on the ocean floor, natural heart shape in red and pink coral, romantic beautiful underwater heart' },
    { file: 'kanji_friend.png', prompt: 'two dolphins swimming side by side as best friends, playful pair of dolphins touching fins, friendship and bonding underwater' },
    { file: 'kanji_father.png', prompt: 'large protective whale swimming above its small calf, father whale guarding baby, paternal care underwater, gentle giant' },
    { file: 'kanji_mother.png', prompt: 'mother sea turtle gently guiding baby turtles toward the light, maternal care, mother and children swimming together underwater' },
    { file: 'kanji_new.png', prompt: 'brand new bright coral polyps just starting to grow on clean rock, fresh new growth underwater, young vibrant sea life beginning' },
    { file: 'kanji_old.png', prompt: 'extremely ancient coral formation weathered and encrusted, old barnacle-covered ruins crumbling underwater, aged and timeworn ocean relics' },
    { file: 'kanji_long.png', prompt: 'incredibly long moray eel stretching across the entire scene, elongated sea creature, long ribbon-like body winding through reef' },
    { file: 'kanji_tall.png', prompt: 'extremely tall underwater rock pillar or sea stack rising from the deep floor upward, towering stone column underwater, impressive height' },
    { file: 'kanji_near.png', prompt: 'curious small fish swimming very close to the viewer, right up to the camera, extremely near, fish face close-up underwater, friendly approach' },
    { file: 'kanji_far.png', prompt: 'tiny silhouette of a whale in the far distance of deep blue water, faraway figure barely visible, vast empty ocean distance, perspective' },
    { file: 'kanji_many.png', prompt: 'enormous dense school of thousands of silver fish swirling in a massive bait ball underwater, incredible number of fish, overwhelming quantity' },
    { file: 'kanji_few.png', prompt: 'just two or three tiny fish swimming alone in vast empty blue water, sparse and lonely, very few creatures in big ocean, minimalist' },
    { file: 'kanji_color.png', prompt: 'rainbow-colored coral reef with every color represented, vivid spectrum of underwater colors, prismatic colorful sea life, vibrant palette' },
    { file: 'kanji_now.png', prompt: 'sunken ornate hourglass with sand still flowing inside on the ocean floor, underwater timepiece still working, present moment captured' },
    { file: 'kanji_night.png', prompt: 'dark nighttime ocean floor scene with bioluminescent creatures glowing in the darkness, nocturnal underwater world, eerie blue-green glow' },
    { file: 'kanji_morning.png', prompt: 'first golden morning sunlight breaking through ocean surface, dawn light reaching the shallows, warm sunrise underwater, new day beginning' },
    { file: 'kanji_house.png', prompt: 'cute small sunken cottage or house on the ocean floor, tiny stone building with fish swimming through doorway, underwater home' },
    { file: 'kanji_road.png', prompt: 'ancient cobblestone path or road on the ocean floor leading into the distance, sunken road stretching away, underwater pathway with coral walls' },
    { file: 'kanji_bird.png', prompt: 'a penguin diving and swimming gracefully underwater, bird swimming beneath the surface, underwater bird in its element, bubbles trailing' },
    { file: 'kanji_cow.png', prompt: 'spotted black and white sea slug or nudibranch that looks like a cow pattern, cow-colored sea creature on coral, adorable underwater' },
    { file: 'kanji_horse.png', prompt: 'beautiful seahorse floating majestically underwater, detailed ornate seahorse with curled tail, horse of the sea, graceful and elegant' },
    { file: 'kanji_black.png', prompt: 'dark black volcanic rock formation on ocean floor, obsidian-like dark stones underwater, deep black cave entrance, inky darkness' },
    { file: 'kanji_pond.png', prompt: 'small clear tidepool or enclosed water area in the reef, little underwater pond with its own tiny ecosystem, miniature lagoon, sheltered' },
    { file: 'kanji_wide.png', prompt: 'extremely wide panoramic view of vast flat ocean floor stretching to all horizons, expansive wide underwater plain, immense breadth' },
    { file: 'kanji_origin.png', prompt: 'ancient primordial underwater vent where first life began, origin of life hydrothermal chimney, primitive sea creatures, genesis spot' },
    { file: 'kanji_half.png', prompt: 'a large boulder split perfectly in half on the ocean floor, cleanly divided stone revealing crystal interior, two equal halves underwater' },
    { file: 'kanji_direction.png', prompt: 'sunken ornate brass compass on the ocean floor, compass rose pointing in four directions, navigation instrument underwater, golden metal' },
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

    console.log(`\n=== Kanji Scene Image Generator ===`);
    console.log(`Output: ${OUTPUT_DIR}`);
    console.log(`Images to generate: ${images.length}\n`);

    const startTime = Date.now();
    let success = 0, fail = 0, skip = 0;

    for (let i = 0; i < images.length; i++) {
        const existed = fs.existsSync(path.join(OUTPUT_DIR, images[i].file));
        const result = await generateImage(images[i], i, images.length);
        if (existed) skip++;
        else if (result) success++;
        else fail++;
    }

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`\n=== Done in ${elapsed} minutes ===`);
    console.log(`Success: ${success} | Skipped: ${skip} | Failed: ${fail}`);
}

main().catch(console.error);
