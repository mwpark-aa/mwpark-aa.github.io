import React from "react";
import {AppBar, Button, Toolbar} from "@mui/material";
import {Link} from "react-router-dom";

const Navbar = () => {
    return (
        <>
            <AppBar position="fixed" color="primary">
                <Toolbar>
                    <Button color="inherit" component={Link} to="/">Home</Button>
                    <Button color="inherit" component={Link} to="/projects">Projects</Button>
                </Toolbar>
            </AppBar>
            <Toolbar/>
        </>
    );
};

export default Navbar;
