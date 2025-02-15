import React, {useRef, useState} from "react";
import {Button, Paper} from "@mui/material";


const scrollTo = (id) => {
    const element = document.getElementById(id);
    if (element) {
        element.scrollIntoView({behavior: "smooth", block: "start", inline: "nearest"});
    }
};

const FloatingNavigation = ({buttons}) => {
    const [position, setPosition] = useState(() => {
        if (window.innerWidth >= 900) {
            return {
                x: window.innerWidth / 2 + 450,
                y: window.innerHeight / 2 - 50
            };
        } else {
            return {
                x: window.innerWidth - 140,
                y: window.innerHeight / 2 - 50
            };
        }
    });
    const navRef = useRef(null);
    const isDragging = useRef(false);
    const offset = useRef({x: 0, y: 0});

    const handleMouseDown = (e) => {
        isDragging.current = true;
        offset.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
        navRef.current.style.cursor = "grabbing";
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    };

    const handleMouseMove = (e) => {
        if (!isDragging.current) return;
        setPosition({
            x: e.clientX - offset.current.x,
            y: e.clientY - offset.current.y
        });
    };

    const handleMouseUp = () => {
        isDragging.current = false;
        navRef.current.style.cursor = "grab";
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
    };

    return (
        <Paper
            ref={navRef}
            elevation={3}
            sx={{
                position: "fixed",
                top: `${position.y}px`,
                left: `${position.x}px`,
                display: {xs: "none", sm: "flex"},
                opacity: {xs: 0, sm: 1},
                transition: 'opacity 0.3s ease-in-out',
                flexDirection: "column",
                gap: 1,
                p: 1,
                bgcolor: "rgba(255, 255, 255, 0.9)",
                borderRadius: 2,
                cursor: "grab",
                userSelect: "none",
                zIndex: 1000,
            }}
            onMouseDown={handleMouseDown}
        >
            {buttons.map(({label, target}) => (
                <Button
                    key={target}
                    variant="text"
                    onClick={() => scrollTo(target)}
                    sx={{textTransform: "none", fontWeight: "bold", minWidth: '102px'}}
                >
                    {label}
                </Button>
            ))}
        </Paper>
    );
};

export default FloatingNavigation;