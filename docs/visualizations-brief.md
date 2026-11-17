# Primeboard: light, plate modes, and a rounded cube

Primeboard is an interactive art project built around one keyboard and three mathematical views. Each of its 26 keys controls a nonnegative integer weight, from 0 to 32. Holding a key increases its weight; playing several keys combines their contributions. Songs drive these same weights automatically.

The views interpret that shared state differently: as a spectrum of light, a mixture of square-plate vibration patterns, or a field on a rounded cube. Primes label the Light keys; spatial mode labels identify the keys in the two eigenmode views.

## 1. Light: from prime factors to color

The keys correspond to the first 26 primes, from 2 through 101. If key $i$ has weight $e_i$, the entire mixture can be encoded exactly as

$$N=\prod_{i=0}^{25}p_i^{e_i}.$$

Unique prime factorization recovers the weights. For example, $30=2\cdot3\cdot5$ activates the first three keys equally. The number 1 represents silence and darkness. The primes are an encoding device; their numerical sizes do not determine the frequencies.

Instead, key position assigns a wavelength on a logarithmic scale:

$$\ell_i=700\left(\frac{400}{700}\right)^{i/25}\text{ nm},\qquad f_i^{\rm light}=\frac{c}{\ell_i}.$$

This spans red to violet, approximately 428–749 THz. Each weight represents relative power in one narrow spectral line. The app adds the lines using the CIE 1931 color-matching functions:

$$(X,Y,Z)=\sum_i e_i\bigl(\bar x(\ell_i),\bar y(\ell_i),\bar z(\ell_i)\bigr).$$

These functions model how a standard human observer responds to different wavelengths. XYZ is converted to screen RGB, with gamut clipping and exposure compression. The result is a display approximation: screens cannot reproduce every pure spectral color. Mixing adds light power; it does not average wavelengths. Different spectra can also produce the same perceived color.

Each key separately receives an equal-tempered musical pitch, C3 through C♯5: $f_i^{\rm audio}=440\,2^{(i-21)/12}$ Hz. Sine-tone amplitude grows as $\sqrt{e_i}$, so its power grows with the weight. These audible pitches are a musical mapping, not optical frequencies shifted down by a single common factor.

## 2. Eigenmodes: Chladni-style patterns on a square plate

A thin, uniform elastic plate supports characteristic standing-wave shapes called **eigenmodes**. For transverse displacement $u$, the ideal bending equation is

$$\rho h\,u_{tt}+D\nabla^4u=0,\qquad D=\frac{Eh^3}{12(1-\nu^2)}.$$

Here $\rho$ is density, $h$ thickness, $E$ Young’s modulus, and $\nu$ Poisson’s ratio. Substituting $u=\phi\cos(\omega t)$ gives the eigenvalue equation $D\nabla^4\phi=\rho h\omega^2\phi$.

Primeboard uses a unit square with **simply supported edges**: displacement and bending moment vanish at the boundary. Its basic shapes are $\sin(m\pi x)\sin(n\pi y)$, with natural frequencies proportional to $m^2+n^2$. The integers $m,n$ count half-waves along the two directions.

For $m<n$, the app uses normalized symmetric and antisymmetric combinations:

$$\phi_{mn}^{\pm}=\sqrt2\,[\sin(m\pi x)\sin(n\pi y)\pm\sin(n\pi x)\sin(m\pi y)].$$

Diagonal modes are $\phi_{mm}=2\sin(m\pi x)\sin(m\pi y)$. Hence the key labels **(1,1), (1,2)+, (1,2)−**, and so on. The first 26 modes are ordered by $m^2+n^2$.

The three readouts expose different aspects of these shapes:

- **Colored nodes:** overlays each active mode’s zero lines in its own color.
- **Vibration strength:** shows mean squared displacement, $\tfrac12\sum_i e_i\phi_i^2$, bright near antinodes.
- **Moving field:** displays the signed sum $u=\sum_i\sqrt{e_i}\phi_i\cos(2\pi f_i^{\rm audio}t/200)$.

The moving field uses musical frequencies slowed 200-fold, rather than the plate’s natural frequency ratios. These are musically retuned eigenmode shapes. The colored overlays evoke Chladni figures, but do not simulate sand or necessarily trace the zeros of the combined field.

## 3. Rounded cube: eigenmodes on a curved surface

The cube joins six flat faces, twelve cylindrical edge patches, and eight spherical corner patches. Its closed surface $S$ has no boundary edges. Modes are computed from the **Laplace–Beltrami operator**, the surface analogue of the ordinary Laplacian:

$$-\Delta_S\phi_j=\mu_j\phi_j.$$

A triangular finite-element mesh turns this into $K\phi_j=\mu_jM\phi_j$, where $K$ is the stiffness matrix and $M$ supplies area weights. The constant mode is omitted; the first 26 nonconstant modes become **φ1–φ26**, ordered by eigenvalue. Symmetry gives some modes equal eigenvalues, so an eigenvalue alone is not a unique label.

For a thin-metal interpretation, the animation uses the simplified bending equation $\rho h u_{tt}+D\Delta_S^2u=0$. This retains the same eigenfunctions, with frequencies proportional to $\mu_j$. Displacement amplitudes scale as $\sqrt{e_j}\mu_1/\mu_j$, making modal energy proportional to the weights in this approximation.

Bright lines show a single mode’s stationary nodes, or the instantaneous zeros of a mixture. Motion is slowed and deformation exaggerated for visibility. This is a scalar surface-bending model: full curved-shell elasticity would also include stretching, tangential motion, and curvature coupling. The sound remains the keyboard’s musical tuning, rather than calibrated metal-shell resonances.

---

Implementation details: [light and sound model](../README.md#the-model), [square-plate model](../web/modes.txt), and [rounded-cube model](../web/data/modes/README.txt).
