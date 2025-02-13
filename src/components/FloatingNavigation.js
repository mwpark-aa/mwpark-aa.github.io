import React, {useEffect, useState} from "react";
import {Button, Paper} from "@mui/material";
import {keyframes} from "@mui/system";

const float = keyframes`
    0% {
        transform: translateY(0px);
    }
    50% {
        transform: translateY(-8px);
    }
    100% {
        transform: translateY(0px);
    }
`;

const scrollTo = (id) => {
    const element = document.getElementById(id);
    if (element) {
        const elementRect = element.getBoundingClientRect();
        const absoluteElementTop = elementRect.top + window.pageYOffset;
        const middle = absoluteElementTop - (window.innerHeight / 2) + (elementRect.height / 2);
        window.scrollTo({
            top: middle,
            behavior: 'smooth'
        });
    }
};

const FloatingNavigation = ({buttons}) => {
    const [containerWidth, setContainerWidth] = useState(0);

    useEffect(() => {
        const updateContainerWidth = () => {
            const container = document.querySelector(".MuiContainer-root");
            if (container) {
                setContainerWidth(container.offsetWidth);
            }
        };

        updateContainerWidth();
        window.addEventListener("resize", updateContainerWidth);
        return () => window.removeEventListener("resize", updateContainerWidth);
    }, []);

    return (
        <Paper
            elevation={3}
            sx={{
                position: "fixed",
                top: "50%",
                transform: "translateY(-50%)",
                right: {xs: 6, md: `calc((100% - ${containerWidth}px) / 2 - 120px)`},
                display: {xs: "none", sm: "flex"},
                opacity: {xs: 0, sm: 1},
                transition: 'opacity 0.3s ease-in-out',
                flexDirection: "column",
                gap: 1,
                p: 1,
                bgcolor: "rgba(255, 255, 255, 0.9)",
                borderRadius: 2,
                animation: `${float} 3s ease-in-out infinite`,
            }}
        >
            {buttons.map(({label, target}) => (
                <Button
                    key={target}
                    variant="text"
                    onClick={() => scrollTo(target)}
                    sx={{textTransform: "none", fontWeight: "bold"}}
                >
                    {label}
                </Button>
            ))}
        </Paper>
    );
};

export default FloatingNavigation;
