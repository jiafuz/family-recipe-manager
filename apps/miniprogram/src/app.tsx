import type { PropsWithChildren } from "react";

import "./app.scss";

function App({ children }: PropsWithChildren): JSX.Element {
  return <>{children}</>;
}

export default App;
