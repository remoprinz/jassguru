import React from 'react';
import JassKreidetafel from '../components/layout/JassKreidetafel';

const Home: React.FC = () => {
  return (
    <div className="w-screen h-screen relative z-10">
      <JassKreidetafel 
        middleLineThickness={3}
        zShapeConfig={{
          innerSpacing: 50,
          sideSpacing: 0,
          edgeSpacing: 70
        }}
      />
    </div>
  );
};

export default Home;