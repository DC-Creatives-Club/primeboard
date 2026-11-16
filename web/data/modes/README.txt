ROUNDED CUBE / SURFACE MODES

Play
----
Rounded cube shows a closed, thin metal surface with six flat faces, twelve cylindrical
edge patches, and eight spherical corner patches. Drag to rotate; with the cube
focused, use the arrow keys to turn and Home to reset the view. Each of the 26
keys selects one surface mode. Hold to increase its weight, or combine keys.
The same exponents still encode the exact integer, light spectrum, and tones.

Inspect a mode loads one prime at exponent 1 and turns Sustain on. Pause motion
stops the visual clock; keys and song events can still change the mixture.
Pausing a song also stops that clock. Motion starts paused when the browser
requests reduced motion. Save image exports the current view and number as PNG.
Switch to Light for the original mixed-light display. The small color chip and
hex value always show the computed mixed-light color; the metal's gold/blue
palette indicates the sign of the surface field and is decorative.

For a single mode, bright lines mark its stationary nodal set. With several
modes, they mark the instantaneous zero-displacement contours, which can move.
This does not simulate grains of sand or predict where sand would settle.

Geometry and numerical solve
----------------------------
The undeformed surface is the boundary of the Minkowski sum
  [-a,a]^3 + B_r, with a = 0.70, r = 0.30, outer width = 2.
Equivalently, ||x - clamp(x,-a,a)|| = r. Units are dimensionless.
The exact surface area is 24 a^2 + 12 pi a r + 4 pi r^2.
Faces meet cylinders and spheres tangentially. The surface has no boundary;
there are no free, clamped, or supported edges. The mesh is welded at all seams.

We solve -Delta_S phi_i = lambda_i phi_i, using piecewise-linear triangular FEM
with cotangent stiffness K and lumped barycentric mass M:
  K phi_i = lambda_i M phi_i.
The browser asset has 4,802 vertices and 9,600 triangles. The uniform constant
mode (lambda = 0) is omitted; the first 26 nonconstant modes map to QWERTY order,
primes 2 through 101. The modes are area-average orthonormal:
  phi_i^T M phi_j / area = delta_ij.
Repeated eigenvalues are expected from cubic symmetry. Their basis orientation
is chosen reproducibly by projecting coordinate monomials into each eigenspace
and orthogonalizing. These are choices within eigenspaces, not distinct natural
frequencies. Extra modes are solved so a complete eigenspace is available before
selecting 26 keys. The final selected eigenspace may therefore be partial.

Validation: mesh refinement to 19,202 vertices changes these eigenvalues by at
most 0.64%. In the spherical limit (a=0, r=1), the first 26 agree with l(l+1),
including multiplicities, within 0.71%. The base mesh area differs from the
analytic area by 0.060%. JSON diagnostics record the double-precision solver
residuals. Node tests independently reassemble the exported float32 mesh's FEM
operator and check residuals, orthogonality, topology, geometry, and checksum.

Thin-metal interpretation
-------------------------
This uses the requested Laplace-Beltrami basis in a SIMPLIFIED SCALAR BENDING
model for transverse displacement u:
  rho h u_tt + D Delta_S^2 u = 0,
  D = E h^3 / (12 (1 - nu^2)), omega_i = sqrt(D/(rho h)) lambda_i.
This surface-biharmonic approximation retains the computed eigenfunctions.
It is NOT a full elastic-shell calculation. A physical curved metal shell also
has tangential motion, stretching, and curvature coupling. Those effects can
change both frequencies and mode shapes. Material, thickness, scale, supports,
and excitation are not specified or fitted here, so these are not calibrated
resonances of a particular metal object. Rigid-body shell modes are not modeled.

The visual field is
  u(x,t) = sum_i A_i phi_i(x) cos(omega_i t),
  A_i = sqrt(e_i) lambda_1 / lambda_i.
Since omega_i is proportional to lambda_i and the basis is normalized, each
mode's total oscillator energy is proportional to e_i. This is an artistic
mapping from exponent weights to modal energy; pressing a key is not a modeled
physical strike or an energy-conserving excitation process.

The display slows frequencies to f_i = 0.18 lambda_i/lambda_1 Hz and exaggerates
normal displacement by 0.026, with a visual amplitude cap to avoid extreme
geometry. Contour width and lighting are for legibility. A single mode's nodal
lines are drawn from phi_i even at its zero-displacement instant. Mixed-mode
contours follow u. All phases begin at zero when a new mixture starts from rest;
phase is not encoded in the number. Pausing permits inspection of a phase.
Audio continues to use the instrument's equal-tempered sine tones, not these
shell frequencies. The surface animation is an additional view of the same
weights rather than a simulation of the audible tones exciting a real shell.

Reproduce
---------
The browser needs no numerical libraries. To regenerate offline, from the repo:
  python3 -m venv .venv-modes
  .venv-modes/bin/pip install -r scripts/requirements-modes.txt
  .venv-modes/bin/python scripts/solve_modes.py --check
  npm test

rounded-cube.bin layout (little endian): 8 bytes PCUBEV01; four uint32 values
(vertex count, triangle count, mode count, reserved); float32 positions xyz;
float32 analytic normals xyz; uint32 triangles; float32 lumped masses; float32
mode values, mode-major. rounded-cube.json contains eigenvalues, geometry,
normalization, validation diagnostics, and the binary SHA-256 checksum.
The mesh and modes are generated by this project's MIT-licensed source.

References
----------
Cotangent Laplacian, mass matrix, and generalized eigendecomposition:
  https://libigl.github.io/tutorial/
Surface discretization background (Keenan Crane, Discrete Differential Geometry):
  https://www.cs.cmu.edu/~kmcrane/Projects/DDG/
Sparse generalized symmetric eigensolver:
  https://docs.scipy.org/doc/scipy/reference/generated/scipy.sparse.linalg.eigsh.html
Thin-plate flexural equation (flat-plate reference, not a curved-shell model):
  https://academic.oup.com/qjmam/article/75/2/127/6593848
