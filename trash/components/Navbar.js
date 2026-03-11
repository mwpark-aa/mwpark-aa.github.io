import React from "react";
import {AppBar, Button, Toolbar} from "@mui/material";
import {Link} from "react-router-dom";

const Navbar = () => {
    return (
        <>
            <AppBar position="fixed" color="primary">
                <Toolbar>
                    <Button color="inherit" component={Link} to="/">홈</Button>
                    <Button color="inherit" component={Link} to="/projects"> 프로젝트 </Button>
                    {/*<Button color="inherit" component={Link} to="/trial-and-error"> 시행착오 </Button>*/}
                    {/*<Button color="inherit" component={Link} to="/toys"> 장난감 </Button>*/}
                </Toolbar>
            </AppBar>
            <Toolbar/>
        </>
    );
};

export default Navbar;
