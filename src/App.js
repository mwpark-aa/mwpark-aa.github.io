import React from "react";
import {BrowserRouter as Router, Route, Routes} from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Projects from "./pages/Projects";
import TrialAndError from "./pages/TrialAndError";

const App = () => {
    return (
        <Router>
            <Navbar/>
            <Routes>
                <Route path="/" element={<Home/>}/>
                <Route path="/projects" element={<Projects/>}/>
                <Route path="/trial-and-error" element={<TrialAndError/>}/>
            </Routes>
        </Router>
    );
};

export default App;
