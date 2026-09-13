# Fly Aural Lab

An interactive music and neural visualization experiment inspired by the auditory neural circuitry and behavior of the fruit fly.

[Open the live website](https://martinaz77.github.io/fly-aural-lab/)

Drop a song, a web soundtrack, or your own voice into an enlarged fruit-fly neural forest. Fly Aural Lab analyzes rhythm, frequency, energy, and acoustic change locally in the browser, then maps those signals onto an auditory neural subnetwork organized from MaleCNS data.

You will see colorful neural branches glow with the sound, while a 3D fruit fly moves through the neural space: flying, landing, walking, grooming its front legs, and flapping its wings.

Fly Aural Lab explores this mapping:

```text
Music / Microphone / Web Audio
            ↓
     Acoustic analysis
            ↓
    JO-related auditory input
            ↓
    MaleCNS neural subnetwork
            ↓
    Simulated neural activity Aᵢ
            ↓
Neural visualization + fly behavior
```

The project uses publicly available neural structure and behavioral research as the basis for an interactive audiovisual model. It is made for curiosity, beauty, and play: try classical music, electronic music, rock, ambient sound, a website player, or your own voice, and watch how the little fly responds.

## What you will see

The left side presents a real 3D auditory circuit module based on a selected subset of 40 fruit-fly neurons from MaleCNS. The subset includes:

- JO-related input neurons;
- downstream neural pathways;
- a small number of descending neurons.

The right side presents the same neural structures as an expanded neural forest. The fly moves around these structures and can land on neural branches, creating a visible link between changing neural activity and changing behavior.

The glowing nodes are not random decoration. Each neuron has a fixed color representing its identity, while its brightness is determined by the current simulated activity value Aᵢ. Therefore:

- quiet audio produces lower activity and dimmer nodes;
- stronger acoustic changes produce higher activity and brighter nodes;
- neural activity changes over time rather than simply switching on and off.

## Why the neurons light up

Audio is analyzed locally in the browser. The model extracts several acoustic features:

- low-, mid-, and high-frequency energy;
- overall audio amplitude;
- rhythmic and modulation intensity;
- sudden changes in loudness, density, or spectral characteristics;
- natural decay during silence or near-silence.

These features are mapped to neurons around the auditory input pathway. The scientific basis is that fruit flies detect vibration and sound through the antennae and Johnston’s organ, and the MaleCNS dataset contains JO-related neurons and their downstream connections.

The resulting activity is influenced by:

- acoustic features;
- neuron position within the selected subnetwork;
- connection direction;
- connection weights;
- activity decay;
- previous activity history.

Conceptually:

```text
Audio
  ↓
Acoustic features
  ↓
Auditory input mapping
  ↓
Weighted neural connections
  ↓
Activity propagation
  ↓
Activity decay
  ↓
Visual and behavioral output
```

This is why a neuron can become brighter, fade, or remain active for a moment after a sound changes. Color shows neuron identity; brightness shows that neuron’s activity within the model.

## What the fly can do

The fly does not simply loop through a fixed dance animation. Its behavior is driven by simulated neural-state changes, especially activity trends associated with selected descending neurons.

Examples include:

- increasing or rapidly changing activity → higher probability of flight, movement, or wing vibration;
- sustained activity → exploratory movement through the neural space;
- decreasing activity → increased tendency to search for a landing point;
- landing on a neural branch → alternating tripod-style walking;
- stable resting → possible foreleg grooming, head movement, abdominal movement, or wing vibration;
- audio stopping → gradual neural activity decay followed by landing or resting behavior.

The behavioral system is designed to make this relationship more intuitive and visually observable:

```text
auditory input
→ neural state
→ behavioral tendency
```

## How to use it

The project can be experienced directly in a web browser without an API key or user account.

You can interact with the visualization in several ways:

- drag and select a local audio file;
- enable the microphone and sing or speak into it;
- paste a supported web audio or video URL;
- use browser tab-audio sharing for supported web playback;
- rotate both 3D views;
- zoom using the mouse wheel or trackpad;
- double-click to reset the camera.

For web-based audio, playback depends on the policies and technical restrictions of the third-party platform. For example, some YouTube videos allow embedding while others return an embedding restriction. A video may therefore play normally on YouTube but fail to play inside this page.

No API key, login service, or cloud backend is required. The static website can be served directly from the `dist/` directory:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Then open:

```text
http://127.0.0.1:4173/
```

Do not open the HTML file directly with `file://`, because microphone access, web audio, and other browser APIs may be restricted in that environment.

## Verification

Run the test suite with:

```sh
node --test tests/*.test.mjs
```

The repository contains tests covering components including:

- neural display;
- neural connectivity;
- model behavior;
- YouTube integration;
- privacy;
- behavioral logic;
- audio input;
- motor behavior.

## Sources, credits, and what was used

### Janelia Research Campus / FlyEM MaleCNS

[MaleCNS](https://male-cns.janelia.org/) provides publicly available data and resources describing the male fruit-fly central nervous system. This project uses information associated with `male-cns:v1.0`, including:

- neuron Body IDs;
- SWC morphology;
- connection weights;
- ROI and cell-type information;
- official brain reference images.

These data are used to construct the neural structures visualized in the application.

### neuPrint

[neuPrint](https://neuprint.janelia.org/?dataset=male-cns:v1.0&qt=findneurons) is used to query and inspect neurons, connections, and annotations within MaleCNS. The 40-neuron subnetwork used by this project was organized around auditory input and downstream pathways.

### Google Neuroglancer

[Google Neuroglancer](https://github.com/google/neuroglancer) provides a reference for exploring and viewing 3D neural data. It informed the spatial visualization approach used in this project. Neuroglancer source code is not bundled directly into the application.

### BrainImation

[BrainImation](https://github.com/kylemath/Brainimation) provided visual inspiration for colorful neural animation and glowing neural structures in a dark spatial environment. This project does not copy BrainImation’s neural data or algorithms; the visualization is generated using this project’s own MaleCNS subnetwork and audio-to-neural mapping.

### FlyGym / NeuroMechFly

[NeLy-EPFL / FlyGym / NeuroMechFly](https://github.com/NeLy-EPFL/flygym) provides references for 3D fruit-fly body models and joint structures. The relevant scientific assets are retained with their associated notices and license information in:

```text
dist/assets/FLYGYM-NOTICE.md
dist/assets/FLYGYM-LICENSE.txt
```

The fly body used in the web application is a web-adapted version of this scientific morphology asset.

### three.js

[three.js](https://threejs.org/) and OrbitControls are used for:

- 3D rendering;
- camera control;
- rotation;
- zoom;
- lighting and visual effects.

Relevant license information is retained in:

```text
dist/vendor/
```

### YouTube IFrame API

The [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference) is used to attempt embedded web playback. The API does not provide raw YouTube audio directly to the application. Audio-reactive behavior for browser-based playback depends on browser audio-sharing mechanisms and user permissions.

## Privacy

Audio analysis is performed locally in the browser. The project does not intentionally:

- upload microphone audio;
- upload local audio files;
- store visitor filenames;
- store submitted URLs;
- use analytics tracking scripts.

Embedded third-party media players may connect directly to external services. Those services may process information such as IP addresses, playback information, or account status according to their own privacy policies.

## Deployment

The application is designed as a static web application. For GitHub Pages deployment, configure the repository to use GitHub Actions and deploy the `dist/` directory as the static site.

The repository can be used as the source for the public website while the generated static files are served through GitHub Pages or another static hosting provider.

## Project summary

Fly Aural Lab combines:

1. publicly available fruit-fly neural data;
2. acoustic feature extraction;
3. a simplified neural activity model;
4. a behavioral mapping system;
5. real-time 3D visualization.

The purpose of the project is to explore how biological neural structure can be translated into an interactive audiovisual experience while maintaining a clear distinction between scientific data and creative modeling.

This repository contains original application code together with data, scientific references, and third-party assets. Please refer to the individual license and attribution files included in the repository before reusing third-party materials. In particular, see:

```text
dist/assets/FLYGYM-NOTICE.md
dist/assets/FLYGYM-LICENSE.txt
dist/vendor/
```

This project builds upon publicly available work and scientific resources from Janelia Research Campus, FlyEM, neuPrint, Neuroglancer, NeLy-EPFL, FlyGym, NeuroMechFly, three.js, and related research communities. Please consult the linked sources and included attribution files for the original scientific datasets, software, and third-party assets.

The current version focuses on:

- audio-reactive neural visualization;
- MaleCNS-inspired auditory neural structures;
- 3D fruit-fly animation;
- simulated neural activity;
- browser-based local audio analysis;
- interactive web audio playback.

Future development may include more detailed neural models, additional sensory pathways, richer behavioral states, and further integration between neural activity and movement.

Fly Aural Lab explores the relationship between sound, neural structure, simulation, and movement.

Final reminder: Fly Aural Lab is an experimental, research-inspired creative coding project; its on-screen activity and movements are model-generated visualizations, not live brain-imaging measurements, individual music-preference predictions, or a full physical closed-loop simulation.
