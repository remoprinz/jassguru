import JassKreidetafel from '../components/JassKreidetafel';

const Home: React.FC = () => {
  return (
    <div className="w-screen h-screen">
      <JassKreidetafel 
        middleLineThickness={3}
        verticalSpacing={15}
        horizontalSpacing={5}
        topBottomSpacing={8}
      />
    </div>
  );
};

export default Home;