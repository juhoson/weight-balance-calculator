// src/components/AircraftBackground.tsx
import React, { useState, useEffect } from 'react';

interface AircraftBackgroundProps {
    selectedAircraft: string;
}

const AircraftBackground: React.FC<AircraftBackgroundProps> = ({ selectedAircraft }) => {
    const [currentImage, setCurrentImage] = useState('');
    const [isTransitioning, setIsTransitioning] = useState(false);

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

    useEffect(() => {
        setIsTransitioning(true);
        const newImage = getBackgroundImage();

        // Start fade out
        const timeout = setTimeout(() => {
            setCurrentImage(newImage);
            // Start fade in
            setIsTransitioning(false);
        }, 300); // Match this with CSS transition duration

        return () => clearTimeout(timeout);
    }, [selectedAircraft]);

    return (
        <div
            className={`absolute inset-0 bg-cover bg-center bg-no-repeat pointer-events-none transition-opacity duration-300 ease-in-out ${
                isTransitioning ? 'opacity-0' : 'opacity-10'
            }`}
            style={{
                backgroundImage: currentImage ? `url(${currentImage})` : 'none',
                zIndex: 0
            }}
            role="img"
            aria-label={`${selectedAircraft} background`}
        />
    );
};

export default AircraftBackground;