import logo from '../../assets/logo.png';

// Logo Nexus Console (frontend/src/assets/logo.png) : un seul point de rendu
// pour garder une taille/qualité cohérente partout (header, login, setup,
// rapport imprimable...) plutôt que de dupliquer un <img> par page.
export default function BrandMark({ size = 32, rounded = true, style }) {
  return (
    <img
      src={logo}
      alt="Nexus Console"
      width={size}
      height={size}
      style={{ display: 'block', objectFit: 'contain', borderRadius: rounded ? size * 0.28 : 0, flex: 'none', ...style }}
    />
  );
}
