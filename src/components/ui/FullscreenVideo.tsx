import React, {useEffect, useRef, useState} from "react";

const BackgroundVideoKeepAwake: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playAttempts, setPlayAttempts] = useState(0);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<string>("");
  const maxPlayAttempts = 10;

  const videoSources = [
    {src: "/ScreenAwakeVideo.mp4", type: "video/mp4"},
    {src: "/ScreenAwakeVideo.webm", type: "video/webm"},
    {src: "/ScreenAwakeVideo.ogg", type: "video/ogg"},
  ];

  const attemptPlay = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      console.log("Versuche Video abzuspielen...");
      await video.play();
      setIsPlaying(true);
      console.log("Video startet erfolgreich");
    } catch (error) {
      console.error("Fehler beim Abspielen:", error);
      setVideoError(`Fehler beim Abspielen: ${error}`);
      if (playAttempts < maxPlayAttempts) {
        setPlayAttempts((prev) => prev + 1);
        console.log(`Wiedergabeversuch ${playAttempts + 1} von ${maxPlayAttempts}`);
        setTimeout(attemptPlay, 1000);
      } else {
        setVideoError("Maximale Anzahl von Wiedergabeversuchen erreicht");
      }
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.autoplay = true;

    console.log("Video-Element initialisiert");

    const updateVideoInfo = () => {
      setVideoInfo(`Netzwerkstatus: ${video.networkState}, Bereitschaftszustand: ${video.readyState}, Fehlercode: ${video.error ? video.error.code : "Kein Fehler"}, Dauer: ${video.duration}, Aktuelle Zeit: ${video.currentTime}`);
    };

    const loadHandler = () => {
      console.log("Video geladen, versuche abzuspielen");
      updateVideoInfo();
      attemptPlay();
    };

    const endedHandler = () => {
      console.log("Video beendet, starte neu");
      video.currentTime = 0;
      attemptPlay();
    };

    video.addEventListener("loadedmetadata", loadHandler);
    video.addEventListener("canplay", loadHandler);
    video.addEventListener("ended", endedHandler);
    video.addEventListener("error", (e) => {
      console.error("Video-Fehler:", e);
      updateVideoInfo();
      if (video.error) {
        setVideoError(`Video-Fehler: ${video.error.message}`);
        console.error("Fehlercode:", video.error.code);
      }
    });

    // Aktualisiere Video-Info regelmäßig
    const infoInterval = setInterval(updateVideoInfo, 1000);

    // Versuche das Video abzuspielen, wenn die Seite sichtbar wird
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        attemptPlay();
      }
    });

    return () => {
      video.removeEventListener("loadedmetadata", loadHandler);
      video.removeEventListener("canplay", loadHandler);
      clearInterval(infoInterval);
    };
  }, []);

  const handleManualPlay = () => {
    attemptPlay();
  };

  return (
    <>
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        loop
        preload="auto"
        poster="/video-poster.jpg"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          zIndex: -1,
        }}
      >
        {videoSources.map((source, index) => (
          <source key={index} src={source.src} type={source.type} />
        ))}
        Ihr Browser unterstützt das Video-Tag nicht.
      </video>
      <div style={{position: "fixed", top: 10, left: 10, zIndex: 9999, backgroundColor: "rgba(255,255,255,0.7)", padding: 5}}>
        <p>Video Status: {isPlaying ? "Spielt" : "Gestoppt"}</p>
        <p>Video Info: {videoInfo}</p>
        {!isPlaying && playAttempts > 0 && <p>Wiedergabeversuch: {playAttempts}/{maxPlayAttempts}</p>}
        {videoError && <p style={{color: "red"}}>{videoError}</p>}
        {!isPlaying && <button onClick={handleManualPlay}>Video manuell starten</button>}
      </div>
    </>
  );
};

export default BackgroundVideoKeepAwake;
