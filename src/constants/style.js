import {styled} from "@mui/material/styles";
import {Avatar, Box, Card, CardMedia, Link, Paper} from "@mui/material";

export const StyledPaper = styled(Paper)(({theme}) => ({
    padding: theme.spacing(6),
    borderRadius: theme.shape.borderRadius * 2,
    backgroundColor: theme.palette.background.paper,
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
    transition: "transform 0.3s ease-in-out",
}));

export const StyledAvatar = styled(Avatar)(({theme}) => ({
    width: theme.spacing(20),
    height: theme.spacing(20),
    objectFit: "cover",
    margin: "0 auto",
    marginBottom: theme.spacing(4),
    border: `4px solid ${theme.palette.primary.main}`,
}));

export const ContactLink = styled(Link)(({theme}) => ({
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

export const StyledCard = styled(Card)(({theme}) => ({
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: 12,
    transition: 'transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out',
    boxShadow: theme.shadows[2],
    '&:hover': {
        transform: 'translateY(-8px)',
        boxShadow: theme.shadows[6],
    },
    backgroundColor: theme.palette.background.paper,
}));

export const StyledMedia = styled(CardMedia)(() => ({
    paddingTop: '56.25%',
    mt: 2,
    mx: 2,
    borderRadius: 2,
    boxShadow: 2,
    objectFir: 'contain',
    transition: 'transform 0.3s ease-in-out',
}));

export const XBox = styled(Box)(() => ({
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "red",
    fontSize: "1.5rem",
}))


export const CodeBlockBox = styled(Box)(() => ({
    backgroundColor: "#f5f5f5",
    padding: 2,
    borderRadius: 1,
    overflowX: "auto",
    fontFamily: "monospace",
}));


export const ProjectBox = styled(Box)`
    height: calc(100vh - 80px);
    overflow-y: auto;
    padding: ${({theme}) => theme.spacing(2)}px;

    ${({theme}) => theme.breakpoints.down('lg')} {
        height: auto;
        overflow-y: visible;
    }
`;
