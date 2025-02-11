import React from "react";
import {Avatar, Box, Container, Divider, IconButton, Link, Paper, Typography} from "@mui/material";
import {styled} from "@mui/material/styles";
import EmailIcon from "@mui/icons-material/Email";
import GitHubIcon from "@mui/icons-material/GitHub";

const StyledPaper = styled(Paper)(({theme}) => ({
    padding: theme.spacing(6),
    borderRadius: theme.shape.borderRadius * 2,
    backgroundColor: theme.palette.background.paper,
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
    transition: "transform 0.3s ease-in-out",
}));

const StyledAvatar = styled(Avatar)(({theme}) => ({
    width: theme.spacing(20),
    height: theme.spacing(20),
    objectFit: "cover",
    margin: "0 auto",
    marginBottom: theme.spacing(4),
    border: `4px solid ${theme.palette.primary.main}`,
}));

const ContactLink = styled(Link)(({theme}) => ({
    display: "flex",
    alignItems: "center",
    color: theme.palette.text.secondary,
    textDecoration: "none",
    margin: theme.spacing(1, 0),
    transition: "color 0.3s ease-in-out",
    "&:hover": {
        color: theme.palette.primary.main,
    },
}));

const Home = () => {
    return (
        <Container maxWidth="sm">
            <Box sx={{mt: 8, textAlign: "center"}}>
                <StyledPaper elevation={3}>
                    <StyledAvatar src="/alcong.jpg"/>
                    <Typography variant="h5" sx={{color: "text.secondary", mb: 4}}>
                        박민우
                    </Typography>

                    <Divider sx={{my: 4}}/>

                    <Typography variant="h4" gutterBottom
                                sx={{color: "primary.main", fontWeight: "medium", textAlign: "left"}}>
                        📬 Contact
                    </Typography>
                    <Box sx={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        textAlign: "left"
                    }}>
                        <ContactLink
                            href="https://mail.google.com/mail/u/0/?view=cm&fs=1&to=parkmin614@gmail.com&su=&body="
                            target="_blank">
                            <IconButton color="primary" sx={{mr: 1}}>
                                <EmailIcon/>
                            </IconButton>
                            parkmin614@gmail.com
                        </ContactLink>
                        <ContactLink href="https://github.com/mwpark-aa" target="_blank">
                            <IconButton color="primary" sx={{mr: 1}}>
                                <GitHubIcon/>
                            </IconButton>
                            GitHub
                        </ContactLink>
                    </Box>
                </StyledPaper>
            </Box>
        </Container>
    );
};

export default Home