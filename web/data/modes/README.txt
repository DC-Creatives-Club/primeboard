ROUNDED CUBE / ELASTIC SHELL MODES

Physical object
---------------
A closed, freely suspended aluminum shell, with no supports, seams, holes,
internal pressure, or prestress. Outside width: 0.200 m; outside rounding
radius: 0.030 m; uniform wall thickness: 0.001 m. The midsurface is offset
inward by 0.0005 m, giving width 0.199 m and radius 0.0295 m.
Young's modulus: 69 GPa; Poisson ratio: 0.33; density: 2700 kg/m^3.
These ideal isotropic properties are specified assumptions, not measurements
of a manufactured object. Faces join cylindrical edges and spherical corners.

Mechanical calculation
----------------------
A linear MITC4 degenerated-shell finite-element model includes in-plane
stretching, bending, transverse shear, and their coupling through curvature.
Each node carries three translation components and two tangent rotations.
Rotation about the local director is redundant and omitted: no drilling
stiffness penalty or artificial drilling mass is added.

The element kernel is from sdypy-model 0.2.0. Primeboard supplies a conforming
quadrilateral mesh and globally shared analytic directors/tangent frames,
assembles the physical five-DOF elements, and solves with SciPy:
  K u_j = lambda_j M u_j,  lambda_j = omega_j^2,
  f_j = sqrt(lambda_j) / (2 pi).
M is a consistent mass matrix including rotary inertia. The shell is not
clamped to suppress rigid motion: its six rigid-body modes are identified and
excluded after solving. Additional elastic modes are solved so repeated
low-frequency eigenspaces can be handled together before selecting 26 keys.
The last retained eigenspace can be partial because the keyboard has 26 keys.

Repeated eigenvalues reflect symmetry. Within each repeated eigenspace,
projections of fixed geometric polynomial probes give a reproducible basis.
An individual basis vector within a degenerate eigenspace is not unique.

Validation
----------
rounded-shell.json records:
* exclusion of six near-zero rigid-body modes and the rigid-motion stiffness residual;
* relative residuals of the elastic eigenpairs and mass orthogonality;
* all 26 frequency changes against a finer quadrilateral mesh;
* a simply supported square-plate benchmark against Kirchhoff-Love frequencies.
The exporter refuses an elastic residual above 1e-5, a plate error above 2.5%,
or a frequency change above 3% on refinement. The plate comparison includes
small transverse-shear/rotary-inertia differences between the two theories.
Mesh convergence is evidence of numerical resolution, not experimental validation.

Display and sound
-----------------
The asset stores the three-dimensional translation vector of every elastic
mode. The visible scalar field is its dot product with the analytic surface
normal. Thus the glowing lines are zeros of NORMAL displacement; tangential
motion need not vanish there. They are not necessarily motionless material lines.
Each vector field is normalized to unit area-average squared displacement for
legibility. Key strengths are artistic controls, not metres or measured energies.

The cube's geometry remains fixed. The existing continuous hold and quick-release
fade show modal envelopes, not the rapid time-dependent vibration itself.
Natural frequencies now set audio pitches directly; the former arbitrary
110 Hz cube fundamental and Laplace-Beltrami frequency ratios are no longer used.
Sound is a sum of short damped modal tones. Damping remains a chosen parameter;
no microphone, contact-force spectrum, air-radiation or room model is solved.
See ../../resonator.txt for interaction and sound details.

Reproduction
------------
Python 3.14, with a headless installation of the pinned kernel dependencies:
  python3 -m venv .venv-shell
  .venv-shell/bin/pip install --no-deps -r scripts/requirements-shell.txt
  .venv-shell/bin/python scripts/solve_shell.py --corner 6 --refine 8
  npm test

The solver loads the installed shell element module directly to avoid unrelated
GUI/VTK dependencies. No modified third-party source is vendored. Intermediate
matrices are cached under /private/tmp/primeboard-shell/<parameter-hash>/.
The legacy rounded-cube.bin/json and solve_modes.py are retained as the previous
scalar Laplace-Beltrami model for reference tests; the app loads rounded-shell.*.

Asset layout (little-endian)
----------------------------
PSHELL01 (8 bytes), four uint32 values: vertex count, triangle count, mode count,
reserved. Then float32 positions xyz (scaled to dimensionless display units),
float32 normals xyz, uint32 triangle indices, float32 nodal drawing-area weights,
float32 normal-displacement fields (mode-major), float32 translation vectors xyz
(mode-major). Rendering triangles are subdivisions of the solve's quads.
The JSON includes SI dimensions, material, eigenvalues in s^-2, frequencies in Hz,
normalization, validation diagnostics and the binary SHA-256 checksum.

References
----------
SDyPy MITC4 shell implementation and modal-analysis documentation:
https://sdypy-model.readthedocs.io/en/latest/tutorials/shell.html
https://github.com/sdypy/sdypy-model
MITC4 elements: K. J. Bathe, Finite Element Procedures (1996), shell formulations.
General shell mechanics and curvature coupling:
https://docu.ngsolve.org/ngs24/SaS/linear_nonlinear_shell_equ.html
