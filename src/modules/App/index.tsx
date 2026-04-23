import {lazy, Suspense} from 'react';
import {Routes, Route, Navigate} from 'react-router-dom';

const Welcome = lazy(() => import('@/modules/Welcome'));
const FarmReminder = lazy(() => import('@/modules/FarmReminder'));

export default function App() {
    return (
        <Suspense fallback={null}>
            <Routes>
                <Route path="welcome" element={<Welcome />} />
                <Route path="farm" element={<FarmReminder />} />
                <Route path="*" element={<Navigate replace to="/farm" />} />
            </Routes>
        </Suspense>
    );
}
