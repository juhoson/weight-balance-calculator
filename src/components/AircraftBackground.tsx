import React from 'react';

interface AircraftBackgroundProps {
    selectedAircraft: string;
}

const AircraftBackground: React.FC<AircraftBackgroundProps> = ({ selectedAircraft }) => {
    const getBackgroundImage = () => {
        switch(selectedAircraft) {
            case 'C172S (SE-MIA)':
                return '/weight-balance/images/c172.jpg';
            case 'DA40D (SE-MBC)':
                return '/weight-balance/images/da40d.jpg';
            case 'DA40NG (SE-MIO)':
                return '/weight-balance/images/da40ng.jpg';
            case 'PA28-161 (SE-KMI)':
                return '/weight-balance/images/pa28160.jpg';
            default:
                return '';
        }
    };

    const backgroundImage = getBackgroundImage();

    return (
        <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-10 pointer-events-none"
            style={{
                backgroundImage: backgroundImage ? `url(${backgroundImage})` : 'none',
                zIndex: 0
            }}
            role="img"
            aria-label={`${selectedAircraft} background`}
        />
    );
};

export default AircraftBackground;