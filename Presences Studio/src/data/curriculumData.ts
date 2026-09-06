import { GradeCurriculum } from '../types/smartboard';

export const CURRICULUM_DATA: GradeCurriculum[] = [
  {
    grade: '10',
    label: 'Class 10',
    subjects: [
      {
        id: 'physics',
        name: 'Physics',
        icon: 'Zap',
        chapters: [
          {
            id: 'light-optics',
            number: 10,
            name: 'Light: Reflection & Refraction',
            description: 'Spherical mirrors, lenses, laws of refraction, refractive index, lens formula and magnification.',
            subTopics: [
              {
                id: 'reflection-spherical-mirrors',
                name: 'Reflection & Spherical Mirrors',
                keyPoints: [
                  'Center of curvature (C), Pole (P), Principal axis, Focus (F)',
                  'Focal length relationship: f = R / 2',
                  'Mirror Formula: 1/f = 1/v + 1/u',
                  'Magnification: m = -v/u = h_i / h_o'
                ],
                formulas: ['f = R / 2', '1/f = 1/v + 1/u', 'm = -v/u = h_i / h_o'],
                videos: [
                  {
                    id: 'vid-optics-1',
                    title: 'Concave & Convex Mirrors: Ray Tracing Animation',
                    creator: 'Khan Academy India',
                    duration: '8:45',
                    youtubeId: '7Zv-Q5yqV_4',
                    description: 'Animated 3D ray diagrams demonstrating real vs virtual focal points on spherical mirrors.',
                    tags: ['Optics', 'Ray Diagrams', 'Class 10', 'Mirrors']
                  },
                  {
                    id: 'vid-optics-2',
                    title: 'Why Do Mirrors Flip Horizontally But Not Vertically?',
                    creator: 'Physics Girl',
                    duration: '4:15',
                    youtubeId: 'vBpxhfBlVLU',
                    description: 'Visual demonstration and 3D spatial explanation of optical reflection.',
                    tags: ['Conceptual', 'Optics', 'Demonstration']
                  }
                ],
                questions: [
                  {
                    id: 'q-optics-1',
                    prompt: 'A concave mirror produces three times magnified real image of an object placed at 10 cm in front of it. Where is the image located?',
                    difficulty: 'medium',
                    type: 'numerical',
                    hints: ['For a real image, magnification m is negative: m = -3', 'Object distance u = -10 cm', 'Use formula: m = -v / u'],
                    solutionSteps: [
                      'Given: u = -10 cm, m = -3 (real image)',
                      'Formula: m = -v / u  =>  -3 = -v / (-10)',
                      '-3 = v / 10  =>  v = -30 cm',
                      'Conclusion: The image is formed 30 cm in front of the concave mirror (on the same side as object).'
                    ],
                    finalAnswer: 'v = -30 cm (30 cm in front of the mirror)',
                    estimatedTimeMin: 2
                  },
                  {
                    id: 'q-optics-2',
                    prompt: 'Find the focal length of a convex mirror whose radius of curvature is 32 cm.',
                    difficulty: 'easy',
                    type: 'numerical',
                    hints: ['Radius of curvature R = +32 cm for convex mirror', 'Focal length f = R / 2'],
                    solutionSteps: [
                      'Given: R = +32 cm',
                      'Relationship: f = R / 2',
                      'Calculation: f = 32 / 2 = +16 cm'
                    ],
                    finalAnswer: 'f = +16 cm',
                    estimatedTimeMin: 1
                  }
                ],
                analogies: [
                  'Think of a shiny metal soup spoon: the inner curved cave is a CONCAVE mirror (inverts your face), while the outer curved back is a CONVEX mirror (makes you look smaller and upright, just like a car side-view mirror!).'
                ]
              },
              {
                id: 'refraction-lenses',
                name: 'Refraction & Snell’s Law',
                keyPoints: [
                  'Bending of light across optical boundaries',
                  'Snell’s Law: n1 * sin(θ1) = n2 * sin(θ2)',
                  'Refractive index n = c / v',
                  'Lens Formula: 1/f = 1/v - 1/u',
                  'Power of a lens: P = 1/f (in meters, unit: Dioptre D)'
                ],
                formulas: ['n = c / v', 'n1 · sin(i) = n2 · sin(r)', '1/f = 1/v - 1/u', 'P = 1/f (in meters)'],
                videos: [
                  {
                    id: 'vid-refraction-1',
                    title: 'Refraction & Snell’s Law Visualized',
                    creator: 'Veritasium',
                    duration: '6:30',
                    youtubeId: 'nlvWd_oK-6E',
                    description: 'Animated wavefronts showing why light bends when changing mediums with car-wheel analogy.',
                    tags: ['Refraction', 'Optics', 'Wavefronts']
                  }
                ],
                questions: [
                  {
                    id: 'q-refr-1',
                    prompt: 'A convex lens of focal length 20 cm produces a sharp image on a screen placed 60 cm away. Find the object distance and magnification.',
                    difficulty: 'hard',
                    type: 'numerical',
                    hints: ['f = +20 cm, v = +60 cm', 'Use lens formula: 1/f = 1/v - 1/u', 'Then magnification m = v / u'],
                    solutionSteps: [
                      'Given: f = +20 cm, v = +60 cm',
                      'Formula: 1/u = 1/v - 1/f',
                      'Substitution: 1/u = 1/60 - 1/20 = (1 - 3) / 60 = -2/60 = -1/30',
                      'Therefore: u = -30 cm',
                      'Magnification: m = v / u = 60 / (-30) = -2 (Real and inverted, 2x enlarged)'
                    ],
                    finalAnswer: 'u = -30 cm, m = -2',
                    estimatedTimeMin: 3
                  }
                ],
                analogies: [
                  'Imagine a shopping cart rolling from smooth pavement onto thick grass at an angle: the wheel hitting the grass slows down first, causing the whole cart to pivot toward the normal!'
                ]
              }
            ]
          },
          {
            id: 'electricity',
            number: 12,
            name: 'Electricity & Circuits',
            description: 'Electric current, potential difference, Ohm’s Law, resistance in series and parallel, Joule’s heating effect.',
            subTopics: [
              {
                id: 'ohms-law-resistors',
                name: 'Ohm’s Law & Combination of Resistors',
                keyPoints: [
                  'Electric current: I = Q / t',
                  'Ohm’s Law: V = I * R (at constant temperature)',
                  'Series Equivalent: R_s = R1 + R2 + R3',
                  'Parallel Equivalent: 1/R_p = 1/R1 + 1/R2 + 1/R3',
                  'Electric Power: P = V * I = I^2 * R = V^2 / R'
                ],
                formulas: ['V = I · R', 'R_s = R1 + R2', '1/R_p = 1/R1 + 1/R2', 'P = V · I', 'H = I^2 · R · t'],
                videos: [
                  {
                    id: 'vid-elec-1',
                    title: 'How Electricity Actually Works: Flow of Charges',
                    creator: 'Veritasium',
                    duration: '9:20',
                    youtubeId: 'bHIhgxav9LY',
                    description: 'Visually intuitive animation of voltage, current, and electron drift in conductor wires.',
                    tags: ['Electricity', 'Circuits', 'Current']
                  },
                  {
                    id: 'vid-elec-2',
                    title: 'Resistors in Series vs Parallel Animated Simulation',
                    creator: 'PhET Interactive Simulations',
                    duration: '5:10',
                    youtubeId: 'g7Qy1j8zR7s',
                    description: 'Interactive circuit building showing current splitting in parallel branches.',
                    tags: ['Circuits', 'Simulation', 'Ohm Law']
                  }
                ],
                questions: [
                  {
                    id: 'q-elec-1',
                    prompt: 'Three resistors of 2 Ω, 3 Ω, and 6 Ω are connected in parallel across a 12V battery. Calculate the equivalent resistance and the total current.',
                    difficulty: 'medium',
                    type: 'numerical',
                    hints: ['1/R_p = 1/2 + 1/3 + 1/6', 'Take LCM of denominators', 'Use I = V / R_p'],
                    solutionSteps: [
                      'Parallel formula: 1/R_p = 1/2 + 1/3 + 1/6',
                      'LCM of 2, 3, 6 is 6: 1/R_p = (3 + 2 + 1) / 6 = 6/6 = 1 Ω',
                      'Therefore equivalent resistance R_p = 1 Ω',
                      'Total current: I = V / R_p = 12 V / 1 Ω = 12 A'
                    ],
                    finalAnswer: 'R_p = 1 Ω, I = 12 A',
                    estimatedTimeMin: 2
                  }
                ],
                analogies: [
                  'Water pipe analogy: Voltage is the water pressure pushing through, Current is the flow rate of liters per second, and Resistance is a bottleneck narrowing the pipe.'
                ]
              }
            ]
          }
        ]
      },
      {
        id: 'mathematics',
        name: 'Mathematics',
        icon: 'Compass',
        chapters: [
          {
            id: 'quadratic-equations',
            number: 4,
            name: 'Quadratic Equations',
            description: 'Standard form ax² + bx + c = 0, factorization, quadratic formula, nature of roots.',
            subTopics: [
              {
                id: 'roots-discriminant',
                name: 'Quadratic Formula & Nature of Roots',
                keyPoints: [
                  'Standard form: ax² + bx + c = 0, a ≠ 0',
                  'Quadratic Formula: x = (-b ± √(b² - 4ac)) / (2a)',
                  'Discriminant D = b² - 4ac',
                  'If D > 0: Two distinct real roots',
                  'If D = 0: Two equal real roots (-b / 2a)',
                  'If D < 0: No real roots (imaginary roots)'
                ],
                formulas: ['D = b² - 4ac', 'x = (-b ± √D) / (2a)', 'Sum of roots = -b/a', 'Product of roots = c/a'],
                videos: [
                  {
                    id: 'vid-quad-1',
                    title: 'The Visual Meaning of the Quadratic Formula',
                    creator: '3Blue1Brown',
                    duration: '11:40',
                    youtubeId: 'IU_b0F0vW8M',
                    description: 'Geometric proof and parabola symmetry animation showing how the quadratic formula emerges.',
                    tags: ['Parabola', 'Quadratic', '3Blue1Brown']
                  }
                ],
                questions: [
                  {
                    id: 'q-quad-1',
                    prompt: 'Find the values of k for which the quadratic equation 2x² + kx + 3 = 0 has two equal real roots.',
                    difficulty: 'medium',
                    type: 'numerical',
                    hints: ['For equal roots, Discriminant D must equal 0', 'D = b² - 4ac = 0', 'a = 2, b = k, c = 3'],
                    solutionSteps: [
                      'Given equation: 2x² + kx + 3 = 0 => a = 2, b = k, c = 3',
                      'Condition for equal roots: D = 0',
                      'D = b² - 4ac  =>  k² - 4(2)(3) = 0',
                      'k² - 24 = 0  =>  k² = 24',
                      'k = ±√24 = ±2√6'
                    ],
                    finalAnswer: 'k = ±2√6',
                    estimatedTimeMin: 2
                  },
                  {
                    id: 'q-quad-2',
                    prompt: 'Solve by factorization: x² - 5x + 6 = 0',
                    difficulty: 'easy',
                    type: 'numerical',
                    hints: ['Find two numbers that multiply to +6 and add to -5', 'Numbers are -2 and -3'],
                    solutionSteps: [
                      'x² - 2x - 3x + 6 = 0',
                      'x(x - 2) - 3(x - 2) = 0',
                      '(x - 2)(x - 3) = 0',
                      'x = 2 or x = 3'
                    ],
                    finalAnswer: 'x = 2, 3',
                    estimatedTimeMin: 1
                  }
                ],
                analogies: [
                  'Imagine kicking a football in the air: its trajectory forms an inverted parabola. Finding the roots is finding the two points where the ball touches the ground (height = 0).'
                ]
              }
            ]
          },
          {
            id: 'trigonometry',
            number: 8,
            name: 'Introduction to Trigonometry',
            description: 'Trigonometric ratios, values for specific angles (30°, 45°, 60°), trigonometric identities.',
            subTopics: [
              {
                id: 'trig-identities',
                name: 'Trigonometric Identities & Values',
                keyPoints: [
                  'sin θ = Opp/Hyp, cos θ = Adj/Hyp, tan θ = Opp/Adj',
                  'sin² θ + cos² θ = 1',
                  '1 + tan² θ = sec² θ',
                  '1 + cot² θ = cosec² θ'
                ],
                formulas: ['sin² θ + cos² θ = 1', '1 + tan² θ = sec² θ', '1 + cot² θ = cosec² θ', 'tan θ = sin θ / cos θ'],
                videos: [
                  {
                    id: 'vid-trig-1',
                    title: 'Trigonometry Visualized: Sine & Cosine on the Unit Circle',
                    creator: 'Mathologer',
                    duration: '8:15',
                    youtubeId: '5Z1bF7h3O7w',
                    description: 'Animated unit circle showing why sine and cosine oscillate like waves.',
                    tags: ['Trigonometry', 'Unit Circle', 'Animation']
                  }
                ],
                questions: [
                  {
                    id: 'q-trig-1',
                    prompt: 'Prove the identity: (sin A + cosec A)² + (cos A + sec A)² = 7 + tan² A + cot² A',
                    difficulty: 'hard',
                    type: 'board-exam',
                    hints: ['Expand using (a + b)²', 'Recall sin A · cosec A = 1 and cos A · sec A = 1', 'Use sec² A = 1 + tan² A and cosec² A = 1 + cot² A'],
                    solutionSteps: [
                      'LHS = (sin² A + 2·sin A·cosec A + cosec² A) + (cos² A + 2·cos A·sec A + sec² A)',
                      '= (sin² A + cos² A) + 2(1) + 2(1) + cosec² A + sec² A',
                      '= 1 + 2 + 2 + (1 + cot² A) + (1 + tan² A)',
                      '= 7 + tan² A + cot² A = RHS. Hence Proved!'
                    ],
                    finalAnswer: 'LHS = RHS = 7 + tan² A + cot² A (Proved)',
                    estimatedTimeMin: 4
                  }
                ],
                analogies: [
                  'Trigonometry is the study of shadows: Sine is how high a shadow climbs up a wall, and Cosine is how far a shadow stretches across the floor as the sun rotates.'
                ]
              }
            ]
          }
        ]
      },
      {
        id: 'chemistry',
        name: 'Chemistry',
        icon: 'Beaker',
        chapters: [
          {
            id: 'chemical-reactions',
            number: 1,
            name: 'Chemical Reactions & Equations',
            description: 'Balancing chemical equations, types of chemical reactions, oxidation and reduction.',
            subTopics: [
              {
                id: 'balancing-equations',
                name: 'Balancing Equations & Types of Reactions',
                keyPoints: [
                  'Law of Conservation of Mass (Atoms before = Atoms after)',
                  'Combination, Decomposition, Displacement, Double Displacement',
                  'Oxidation (gain of oxygen/loss of electrons) and Reduction'
                ],
                formulas: ['2Mg + O2 -> 2MgO', 'Fe + CuSO4 -> FeSO4 + Cu', 'Zn + 2HCl -> ZnCl2 + H2'],
                videos: [
                  {
                    id: 'vid-chem-1',
                    title: 'How to Balance Any Chemical Equation (3D Molecule Animation)',
                    creator: 'Tyler DeWitt',
                    duration: '7:40',
                    youtubeId: 'zmdxMlb88Fs',
                    description: 'Atomic sphere models showing why you only change coefficients, never subscripts.',
                    tags: ['Chemistry', 'Balancing', 'Atoms']
                  }
                ],
                questions: [
                  {
                    id: 'q-chem-1',
                    prompt: 'Balance the equation: Fe + H2O -> Fe3O4 + H2',
                    difficulty: 'medium',
                    type: 'numerical',
                    hints: ['Balance Fe first (3 on right)', 'Balance Oxygen next (4 on right)', 'Finally balance Hydrogen'],
                    solutionSteps: [
                      'Count initial atoms: Left: Fe=1, H=2, O=1. Right: Fe=3, H=2, O=4',
                      'Step 1: Balance Fe by placing 3 in front of Fe: 3Fe + H2O -> Fe3O4 + H2',
                      'Step 2: Balance O by placing 4 in front of H2O: 3Fe + 4H2O -> Fe3O4 + H2',
                      'Step 3: Now Left has 8 H atoms. Balance H by placing 4 in front of H2: 3Fe + 4H2O -> Fe3O4 + 4H2',
                      'Check: Fe: 3=3, H: 8=8, O: 4=4. Balanced!'
                    ],
                    finalAnswer: '3Fe + 4H₂O → Fe₃O₄ + 4H₂',
                    estimatedTimeMin: 2
                  }
                ],
                analogies: [
                  'Think of a chemical formula as a recipe: if you need 2 slices of bread and 1 cheese slice to make 1 sandwich (2B + C -> B2C), you cannot change the sandwich ingredients, only how many batches you cook!'
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  {
    grade: '12',
    label: 'Class 12',
    subjects: [
      {
        id: 'physics-12',
        name: 'Physics',
        icon: 'Zap',
        chapters: [
          {
            id: 'electrostatics',
            number: 1,
            name: 'Electric Charges & Fields',
            description: 'Coulomb’s Law, electric field, electric dipole, Gauss’s Theorem and applications.',
            subTopics: [
              {
                id: 'coulombs-law-gauss',
                name: 'Coulomb’s Law & Gauss’s Law',
                keyPoints: [
                  'Coulomb force: F = (1 / 4πε₀) · (q1·q2 / r²)',
                  'Permittivity of free space ε₀ ≈ 8.854 × 10⁻¹² C²/(N·m²)',
                  'Gauss Law: Φ = ∮ E · dA = q_enclosed / ε₀'
                ],
                formulas: ['F = (1/4πε₀) · (q1·q2 / r²)', 'E = F / q', 'Φ = q_enclosed / ε₀'],
                videos: [
                  {
                    id: 'vid-coulomb-1',
                    title: 'Electric Fields & Gauss’s Law 3D Visualization',
                    creator: '3Blue1Brown',
                    duration: '14:20',
                    youtubeId: 'Wz3g5j-f6_0',
                    description: 'Vector flux and electric field lines rendered in dynamic 3D space.',
                    tags: ['Electrostatics', 'Gauss Law', 'Vectors']
                  }
                ],
                questions: [
                  {
                    id: 'q-coul-1',
                    prompt: 'Two point charges +2 μC and +6 μC repel each other with a force of 12 N. If each charge is given an additional charge of -4 μC, what will be the new force between them?',
                    difficulty: 'medium',
                    type: 'numerical',
                    hints: ['Initial charges: q1 = +2, q2 = +6 => product = 12', 'New charges: q1\' = 2 - 4 = -2 μC, q2\' = 6 - 4 = +2 μC => product = -4', 'Force is proportional to product of charges: F\' / F = (q1\'·q2\') / (q1·q2)'],
                    solutionSteps: [
                      'Initial product: q1 · q2 = (+2) × (+6) = +12 (Repulsive force F = 12 N)',
                      'New charges after adding -4 μC:',
                      'q1\' = +2 - 4 = -2 μC',
                      'q2\' = +6 - 4 = +2 μC',
                      'New product: q1\' · q2\' = (-2) × (+2) = -4',
                      'Ratio of forces: F\' / F = (q1\' · q2\') / (q1 · q2) = (-4) / (+12) = -1/3',
                      'Therefore: F\' = 12 × (-1/3) = -4 N',
                      'Magnitude is 4 N, and negative sign means the new force is ATTRACTIVE.'
                    ],
                    finalAnswer: '4 N (Attractive)',
                    estimatedTimeMin: 3
                  }
                ],
                analogies: [
                  'Think of Gauss’s Law like a lightbulb inside a closed box: the total amount of light streaming out through all the walls only depends on how bright the bulb inside is, regardless of the shape of the box!'
                ]
              }
            ]
          }
        ]
      }
    ]
  }
];
