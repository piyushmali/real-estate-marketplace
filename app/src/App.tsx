import { RouterProvider } from 'react-router-dom';
import { router } from '@/lib/router';
import { Toaster } from "sonner";

function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}

export default App;