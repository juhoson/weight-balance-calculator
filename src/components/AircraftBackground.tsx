import React from 'react';

interface AircraftBackgroundProps {
    selectedAircraft: string;
}

const AircraftBackground: React.FC<AircraftBackgroundProps> = ({selectedAircraft}) => {
  const [imageState, setImageState] = React.useState({
    currentImage: '',
    isTransitioning: false
  });

  const getBackgroundImage = React.useMemo(() => {
    const imagePaths = {
      'DA40D (SE-MBC)': '/weight-balance/images/da40d.jpg',
      'DA40NG (SE-MIO)': '/weight-balance/images/da40ng.jpg',
      'PA28-161 (SE-KMI)': '/weight-balance/images/pa28160.jpg',
      'PA18-150 (SE-GCG)': '/weight-balance/images/pa18150.jpg'
    } as const;

    return (aircraft: string) => imagePaths[aircraft as keyof typeof imagePaths] || '';
  }, []);

  React.useEffect(() => {
    if (!selectedAircraft) return;

    setImageState(prev => ({...prev, isTransitioning: true}));

    const timer = setTimeout(() => {
      setImageState({
        currentImage: getBackgroundImage(selectedAircraft),
        isTransitioning: false
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [selectedAircraft, getBackgroundImage]);

  if (!selectedAircraft) return null;

  return (
    <div
      className={`fixed inset-0 bg-cover bg-center bg-no-repeat pointer-events-none transition-opacity duration-300 ease-in-out ${
        imageState.isTransitioning ? 'opacity-0' : 'opacity-20'
      }`}
      style={{
        backgroundImage: imageState.currentImage ? `url(${imageState.currentImage})` : 'none'
      }}
      role="img"
      aria-label={`${selectedAircraft} background`}
    />
  );
};
export default AircraftBackground;