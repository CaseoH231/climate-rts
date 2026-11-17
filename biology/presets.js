// Ready-made topics you can add from "+ New topic". Each comes with starter definitions you can edit.
const n = (title, definition, notes = [], found = '') => ({ title, definition, notes, found });

export const PRESETS = [
  { name: 'Cell transport', color: '#0891b2', blurb: 'Diffusion, osmosis, active transport', entries: [
    n('Diffusion', 'The net movement of particles from an area of higher concentration to an area of lower concentration.', ['Passive – needs no energy', 'Faster with a bigger concentration gradient, higher temperature or larger surface area']),
    n('Osmosis', 'The movement of water from a dilute solution to a more concentrated solution through a partially permeable membrane.', ['A special type of diffusion – just water', 'Plant cells become turgid in pure water; animal cells can burst']),
    n('Active transport', 'Moving substances from a more dilute solution to a more concentrated solution (against the concentration gradient), using energy from respiration.', ['Root hair cells take in mineral ions this way', 'Needs carrier proteins in the membrane']),
    n('Concentration gradient', 'The difference in concentration between two areas.', ['Steeper gradient = faster diffusion']),
    n('Partially permeable membrane', 'A membrane that lets some molecules through but not others.', ['Small molecules like water and oxygen pass; large ones like starch do not']),
    n('Surface area to volume ratio', 'How much surface an object has compared with its size. Small organisms have a large ratio.', ['Big organisms need exchange surfaces (lungs, villi, gills) and transport systems']),
  ] },
  { name: 'Enzymes', color: '#d97706', blurb: 'Active site, lock and key, denaturing', entries: [
    n('Enzyme', 'A biological catalyst – a protein that speeds up reactions without being used up.'),
    n('Active site', 'The part of an enzyme where the substrate fits and the reaction happens.', ['Its shape is specific to one substrate']),
    n('Substrate', 'The molecule an enzyme acts on.'),
    n('Lock and key model', 'The substrate fits the active site exactly, like a key fits a lock.'),
    n('Denatured', 'When the shape of the active site changes (from high temperature or the wrong pH) so the substrate no longer fits.', ['Permanent – the enzyme stops working']),
    n('Optimum', 'The temperature or pH at which an enzyme works fastest.', ['Most human enzymes: about 37 °C', 'Pepsin in the stomach works best at about pH 2']),
  ] },
  { name: 'Photosynthesis', color: '#16a34a', blurb: 'Equation, limiting factors, leaves', entries: [
    n('Photosynthesis', 'Plants use light energy to turn carbon dioxide and water into glucose and oxygen.', ['carbon dioxide + water → glucose + oxygen', '6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂', 'Endothermic – takes in energy from light'], 'Plant, Algae'),
    n('Chlorophyll', 'The green pigment in chloroplasts that absorbs light energy.'),
    n('Limiting factor', 'The thing in shortest supply that stops the rate of photosynthesis going any faster.', ['Light intensity, carbon dioxide concentration, temperature']),
    n('Stomata', 'Tiny pores, mostly on the underside of leaves, that let gases in and out.', ['Opened and closed by guard cells', 'Water vapour escapes through them (transpiration)']),
    n('Uses of glucose', 'Plants use the glucose they make for respiration, and to make starch, cellulose, fats, oils and proteins.'),
  ] },
  { name: 'Respiration', color: '#dc2626', blurb: 'Aerobic, anaerobic, oxygen debt', entries: [
    n('Aerobic respiration', 'Releasing energy from glucose using oxygen.', ['glucose + oxygen → carbon dioxide + water', 'Happens in mitochondria', 'Exothermic – releases energy']),
    n('Anaerobic respiration (animals)', 'Releasing energy from glucose without oxygen, making lactic acid.', ['glucose → lactic acid', 'Releases much less energy than aerobic']),
    n('Fermentation', 'Anaerobic respiration in yeast and plant cells.', ['glucose → ethanol + carbon dioxide', 'Used to make bread and alcoholic drinks']),
    n('Oxygen debt', 'The extra oxygen needed after exercise to break down the lactic acid that built up.'),
    n('Metabolism', 'The sum of all the chemical reactions in a cell or the body.'),
  ] },
  { name: 'Cell division', color: '#7c3aed', blurb: 'Mitosis, meiosis, stem cells', entries: [
    n('Chromosome', 'A long coiled molecule of DNA carrying many genes.', ['Human body cells have 23 pairs (46)']),
    n('Mitosis', 'Cell division that makes two genetically identical daughter cells.', ['Used for growth and repair', 'Part of the cell cycle']),
    n('Meiosis', 'Cell division that makes four genetically different gametes, each with half the number of chromosomes.', ['Happens in the testes and ovaries']),
    n('Cell cycle', 'The series of stages a cell goes through to divide: growth and DNA copying, then mitosis, then the cell splits.'),
    n('Stem cell', 'An undifferentiated cell that can divide and become many types of cell.', ['Found in embryos, bone marrow and plant meristems']),
    n('Differentiation', 'When a cell becomes specialised for a particular job.'),
  ] },
  { name: 'DNA & genetics', color: '#db2777', blurb: 'Genes, alleles, genotype', entries: [
    n('DNA', 'The chemical that genetic material is made of: a double helix made of two strands.', ['A polymer made of nucleotides', 'Bases: A pairs with T, C pairs with G']),
    n('Gene', 'A small section of DNA on a chromosome that codes for a particular protein.'),
    n('Allele', 'A different version of the same gene.'),
    n('Genotype', 'The alleles an organism has, e.g. Bb.'),
    n('Phenotype', 'The characteristic that shows, e.g. brown eyes.'),
    n('Dominant', 'An allele that always shows, even if only one copy is present.'),
    n('Recessive', 'An allele that only shows if two copies are present.'),
    n('Homozygous / heterozygous', 'Homozygous: two of the same allele (BB or bb). Heterozygous: two different alleles (Bb).'),
  ] },
  { name: 'Microscopy', color: '#2563eb', blurb: 'Magnification, resolution, cell types', entries: [
    n('Magnification', 'How many times bigger the image is than the real object.', ['magnification = image size ÷ real size', '1 mm = 1000 µm']),
    n('Resolution', 'The ability to tell apart two points that are close together – how much detail you can see.'),
    n('Light microscope', 'Uses light and lenses. Can see cells and the nucleus, but not small organelles.'),
    n('Electron microscope', 'Uses electrons. Much higher magnification and resolution – shows ribosomes and mitochondria in detail.'),
    n('Eukaryotic cell', 'A cell with its DNA inside a nucleus, e.g. animal and plant cells.'),
    n('Prokaryotic cell', 'A smaller, simpler cell with no nucleus – its DNA is a single loop, e.g. bacteria.'),
  ] },
  { name: 'Specialised cells', color: '#4d7c0f', blurb: 'Sperm, nerve, root hair, xylem', entries: [
    n('Sperm cell', 'Carries the male DNA to the egg.', ['Tail to swim', 'Lots of mitochondria for energy', 'Enzymes in the head to digest into the egg'], 'Animal'),
    n('Nerve cell', 'Carries electrical signals around the body.', ['Long, with branched connections at each end'], 'Animal'),
    n('Muscle cell', 'Contracts to move parts of the body.', ['Lots of mitochondria', 'Long, with proteins that slide over each other'], 'Animal'),
    n('Root hair cell', 'Absorbs water and mineral ions from the soil.', ['Long hair gives a big surface area', 'No chloroplasts'], 'Plant'),
    n('Xylem', 'Hollow tubes that carry water and mineral ions up from the roots.', ['Made of dead cells strengthened with lignin'], 'Plant'),
    n('Phloem', 'Tubes that carry dissolved sugars around the plant (translocation).', ['Made of living cells with pores in the end walls'], 'Plant'),
  ] },
];
