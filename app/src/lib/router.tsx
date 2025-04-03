import { createBrowserRouter } from 'react-router-dom';
import Layout from '@/components/Layout';
import Properties from '@/pages/Properties';
import PropertyDetails from '@/pages/PropertyDetails';
import MyProperties from '@/pages/MyProperties';
import MyOffers from '@/pages/MyOffers';
import TransactionHistory from '@/pages/TransactionHistory';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Properties />,
      },
      {
        path: 'property/:id',
        element: <PropertyDetails />,
      },
      {
        path: 'my-properties',
        element: <MyProperties />,
      },
      {
        path: 'my-offers',
        element: <MyOffers />,
      },
      {
        path: 'transactions',
        element: <TransactionHistory />,
      },
    ],
  },
]);