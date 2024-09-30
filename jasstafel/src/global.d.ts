interface ScreenOrientation {
  lock(orientation: OrientationLockType): Promise<void>;
}

interface Screen {
  orientation?: ScreenOrientation;
}

type OrientationLockType = 'any' | 'natural' | 'landscape' | 'portrait' | 'portrait-primary' | 'portrait-secondary' | 'landscape-primary' | 'landscape-secondary';