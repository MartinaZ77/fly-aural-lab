# Neural-space visualization

The 40-neuron MaleCNS subset, acoustic model and simulated activity Aᵢ are shared by both views. AudioWorklet samples advance the model and motor controller at 100 Hz. Rendering cannot advance either clock. No RMS or beat signal bypasses the neural pathway into body control.

## Scientific boundary

- Skeletons, Body IDs and observed directed synapse counts are structural data. Auditory tuning, neural time constants, activity and movement readouts are **model assumptions**, not measured brain activity, musical preference or validated behavior predictions.
- This is a selected 40-cell subnetwork, not the whole brain or a complete auditory circuit. Predicted transmitters are not direct physiological measurements; unknown transmitters are not silently treated as excitation.
- FlyGym/NeuroMechFly supplies the micro-CT-derived female body meshes and neutral articulated hierarchy (69 parts). This is an external morphology proxy for the male connectome, not the same specimen. There is no MuJoCo, muscle simulation, adhesion, aerodynamic force or validated sensory feedback loop.
- Body, branches, feet and wings are deliberately not at real anatomical scale. Placing a whole fly inside its enlarged neural skeleton is an artistic metaphor.

## Automatic behavior

`BehaviorController` consumes the four loaded descending-neuron activities. Mean activity is scaled by 12, clamped to [0,1] and smoothed with a 120 ms constant. Normalized DN activity, mean drive and its rise feed an explicit competing-score controller. A 0.9 s minimum bout, 0.24 s candidate dwell, score margin and activity-dependent habituation allow flight, walking, reverse, resting, grooming and small body accents to alternate. The coefficients do not assign experimentally established behavioral identities to these DNs.

There is no action selector or random timed playlist. Silence selects rest, while an in-progress airborne sequence finishes a geometrical landing. It does not freeze or groom in midair. Stop/disconnect clears the input and resets to the initial supported pose. The legacy `MotorController` remains for the neural readout and legacy unit tests; its old hover routes do not control the current page.

## Geometry and movement

The background uses brain-local portions (`p[3] <= 43000`) of the original skeletons. Parent–child segments undergo one common uniform 46-unit transform and rigid rotation. There is no brain shell, synthetic ribbon or invented neural connection.

- Air navigation checks sampled segments with a conservative 1.8-unit root clearance and uses connected free-space cells. Random destination scores, recent-visit penalties and checked shortcuts provide exploration rather than center-directed circular motion. Drive changes speed and mildly biases height. A fresh seed is created on page load; replaying the same seed and activity is deterministic. There is no claim of avoiding every mesh/wing collision.
- Landing supports are sampled **on original unbranched polylines**, subject to approach clearance, local slope and reachability. This dataset currently offers only three conservative landing sites; it is not possible to land on every branch. Return routes finish the current checked leg, then approach a support, extend the feet, and settle above it. Ground travel stays on that support's local polyline; takeoff returns to its checked corridor first.
- Cruise legs have fixed, coordinated folded targets in body coordinates; they do not run a walking oscillator. Both wings stay spread and flap at a deliberately slowed visualization rate, not a measured wingbeat frequency. Feet extend together only on final approach.
- Grounded walking uses alternating LF/RM/LH and RF/LM/RH groups, with overlapping stance (duty 0.62–0.80), short distance-driven steps and world-fixed stance anchors. Swing feet lift and reach to new points on the same polyline. During front-pair grooming, four other feet support the body. The actual articulated joint axes are solved with bounded inverse kinematics; bones are not lengthened. Joint limits, narrow-branch stance, reversed gait and grooming poses are illustrative, not a fitted biomechanical controller.

The broad gait and landing choices are informed by [Chun et al., eLife 2021](https://elifesciences.org/articles/65878), [Mendes et al., eLife 2013](https://elifesciences.org/articles/00231), [Ache et al., Nature Neuroscience 2019](https://www.nature.com/articles/s41593-019-0413-4), and the [grooming suppression-hierarchy study](https://elifesciences.org/articles/02951). These studies do not validate music-driven grooming or the present neural-to-motor coefficients. In particular, a visually evoked landing result is not evidence for an auditory landing pathway.

## Color, glowing nodes and synchronization

`createNeuralFrame` copies Aᵢ and model time once into an immutable snapshot. Both views consume that exact object, indexed by Body ID. Colors identify cells using the same fixed 12-color palette; they are not official functional labels. There is no neuron selection, forced activation or selected-cell brightness override in the page.

- Line alpha: `0.17 + 0.8 * Aᵢ * contrast`. The baseline reveals anatomy even at zero activity.
- Shared glow alpha: `0.7 * (1 - exp(-8 * Aᵢ)) / (1 - exp(-8)) * contrast`. This monotonic display contrast restores visible colored halos without extra pulses or time filtering. It is not calibrated calcium fluorescence. Aᵢ=0 produces no activity glow.
- Flight-space points sit at sparsely sampled original skeleton vertices (every 96th vertex, fixed Body-ID-dependent offset), with fixed 2.2-unit size. They are **display markers, not measured synapse locations, individual cell bodies or travelling spikes**. All markers belonging to a cell read that cell's Aᵢ. The anatomy view uses a fixed 6-pixel glow around its traces.
- Contrast is 1 normally and 0.3 under system reduced-motion preference. A given cell's onset, peak and decay use the same sample in both views. Perspective, clipping, fog, occlusion and different drawing primitives can still affect apparent pixel brightness; there is no pixel-level image registration.

The interface fixes gain 1, auto behavior, limb boost 4, neural backdrop/glow on and structural edge annotations off. Arrow keys rotate a focused canvas, +/− zoom, and 0 or double-click resets its camera. These display choices never change the neural equations.

## Audio and YouTube

Files, CORS-enabled direct audio, user-authorized tab sound and microphones all feed AudioWorklet → acoustic features → neural simulation → body controller. Microphone/shared streams are analyzed locally without speaker monitoring, recording or uploads. Switching input, stopping and leaving the page end all owned stream tracks. Pending permission results are invalidated by an input epoch.

YouTube, Bilibili, Vimeo and SoundCloud open their supported embeds; arbitrary HTTP(S) links retain an original-page entry. The official YouTube iframe API reports loading/play/pause/error separately from sound reception. **A PLAYING event never changes Aᵢ.** The browser must grant tab-audio sharing before embedded YouTube sound can reach Web Audio. Capturing the current app tab does not loop the shared sound back to its speakers. A live but silent track is not reported as active music.

Embedding restrictions (including YouTube 101/150), unavailable videos, login/DRM/network restrictions, source-validation failures and autoplay policies cannot be bypassed by this page. Errors retain the original-page route. The [YouTube iframe API](https://developers.google.com/youtube/iframe_api_reference) does not expose raw audio samples; [display capture](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia) is browser- and platform-dependent and always user-authorized.

## Assets, privacy and tests

Body provenance and Apache-2.0 terms: `dist/assets/FLYGYM-NOTICE.md` and `FLYGYM-LICENSE.txt`. Vendored Three.js/OrbitControls retain their MIT license. Public MaleCNS queries and dataset limitations remain with the graph.

No personal recordings, sign-in URLs, passwords, API keys or account details are required. Third-party players receive ordinary direct browser requests and are governed by their own privacy policies. Public source exports exclude `.git`, `.openai`, local credentials, screenshots and personal history; they use a neutral initial commit when uploaded to a new public repository.

Run `node --test tests/*.test.mjs`. Preview using `python3 -m http.server 4173 --bind 127.0.0.1 --directory dist`. Tests cover frequency-selective input, observed-edge propagation, shared brightness, random routes, branch-only landings, stance anchors, actual rig reachability, quiet-input behavior and error handling. Browser checks separately exercise media permissions, source cleanup, reduced motion, keyboard controls and responsive layout. Synthetic tests are not proof that a particular YouTube video can play.
