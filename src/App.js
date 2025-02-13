import React from "react";
import {BrowserRouter as Router, Route, Routes} from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages";
import Projects from "./pages/projects";
import TrialAndError from "./pages/trial-and-error";
import UseKcp from "./pages/trial-and-error/details/useKcp";
import FirstSpark from "./pages/trial-and-error/details/firstSpark";

const App = () => {
    return (
        <Router>
            <Navbar/>
            <Routes>
                <Route path="/" element={<Home/>}/>
                <Route path="/projects" element={<Projects/>}/>
                <Route path="/trial-and-error" element={<TrialAndError/>}/>
                <Route path="/trial-and-error/use-kcp" element={<UseKcp/>}/>
                <Route path="/trial-and-error/first-spark" element={<FirstSpark/>}/>
            </Routes>
        </Router>
    );
};

export default App;
